use axum::{
    extract::{Multipart, State, DefaultBodyLimit, ws::{WebSocketUpgrade, WebSocket, Message}, Json},
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use std::{net::SocketAddr, sync::{Arc, Mutex}};
use tokio::{fs, fs::File, io::AsyncWriteExt, sync::broadcast};
use tower_http::{services::ServeDir, cors::{CorsLayer, Any}};

#[derive(Clone)]
struct AppState {
    tx: broadcast::Sender<String>,
    current_video: Arc<Mutex<Option<String>>>,
}



#[tokio::main]
async fn main() {
    let (tx, _) = broadcast::channel(10);
    let current_video = Arc::new(Mutex::new(None));

    let state = AppState { tx, current_video };

    let app = Router::new()
        .route("/ws", get(ws_handler))
        .route("/ip", get(get_ip))
        .route("/upload", post(upload_video))
        .route("/api/videos", get(list_videos))
        .route("/api/cast", post(cast_video))
        .nest_service("/receiver", ServeDir::new("public/receiver"))
        .nest_service("/videos", ServeDir::new("public/videos"))
        .layer(DefaultBodyLimit::disable())
        .layer(CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any))
        .with_state(state);

    let addr = SocketAddr::from(([0,0,0,0], 3000));
    println!("Running on http://{}", addr);

    axum::serve(tokio::net::TcpListener::bind(addr).await.unwrap(), app)
        .await
        .unwrap();
}

fn get_local_ip() -> String {
    use std::net::UdpSocket;

    let socket = UdpSocket::bind("0.0.0.0:0").unwrap();
    socket.connect("8.8.8.8:80").unwrap();
    let local_addr = socket.local_addr().unwrap();

    local_addr.ip().to_string()
}

async fn get_ip() -> String {
    get_local_ip()
}

async fn list_videos() -> Json<Vec<String>> {
    let mut videos = Vec::new();
    if let Ok(mut entries) = fs::read_dir("public/videos").await {
        while let Ok(Some(entry)) = entries.next_entry().await {
            if let Ok(name) = entry.file_name().into_string() {
                if !name.starts_with('.') {
                    videos.push(name);
                }
            }
        }
    }
    Json(videos)
}

async fn cast_video(
    State(state): State<AppState>,
    Json(payload): Json<serde_json::Value>,
) -> String {
    if let Some(filename) = payload.get("filename").and_then(|v| v.as_str()) {
        let video_url = format!("/videos/{}", filename);
        
        if let Ok(mut current) = state.current_video.lock() {
            *current = Some(video_url.clone());
        }

        let _ = state.tx.send(serde_json::json!({ "url": video_url }).to_string());
        return "Casting".into();
    }
    "Error".into()
}

// WebSocket (TV listens)
async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: AppState) {
    let initial_video = {
        let current = state.current_video.lock().unwrap();
        current.clone()
    };
    
    if let Some(url) = initial_video {
        let _ = socket.send(Message::Text(serde_json::json!({ "url": url }).to_string())).await;
    }

    let mut rx = state.tx.subscribe();
    while let Ok(msg) = rx.recv().await {
        let _ = socket.send(Message::Text(msg)).await;
    }
}

// Upload video
async fn upload_video(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> String {
    while let Some(field) = multipart.next_field().await.unwrap() {
        let filename = field.file_name().unwrap().to_string();
        let filepath = format!("public/videos/{}", filename);

        let mut file = File::create(&filepath).await.unwrap();

        let data = field.bytes().await.unwrap();
        file.write_all(&data).await.unwrap();

        // URL TV will use
        let video_url = format!("/videos/{}", filename);
        
        if let Ok(mut current) = state.current_video.lock() {
            *current = Some(video_url.clone());
        }

        let _ = state.tx.send(
            serde_json::json!({ "url": video_url }).to_string()
        );

        return "Uploaded & Playing".into();
    }

    "No file".into()
}