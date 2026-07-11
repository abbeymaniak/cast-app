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
        .route("/api/upload-subtitle", post(upload_subtitle))
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

async fn check_and_convert_srt(stem: &str) -> bool {
    let vtt_path = format!("public/videos/{}.vtt", stem);

    // If VTT already exists, subtitles are available
    if fs::metadata(&vtt_path).await.is_ok() {
        return true;
    }

    // Check if SRT exists (case-insensitive checks)
    let srt_path = format!("public/videos/{}.srt", stem);
    let srt_path_upper = format!("public/videos/{}.SRT", stem);

    let active_srt = if fs::metadata(&srt_path).await.is_ok() {
        Some(srt_path)
    } else if fs::metadata(&srt_path_upper).await.is_ok() {
        Some(srt_path_upper)
    } else {
        None
    };

    if let Some(path) = active_srt {
        if let Ok(srt_bytes) = fs::read(&path).await {
            let srt_str = String::from_utf8_lossy(&srt_bytes).into_owned();
            let vtt_str = srt_to_vtt(&srt_str);
            if let Ok(mut vtt_file) = File::create(&vtt_path).await {
                if vtt_file.write_all(vtt_str.as_bytes()).await.is_ok() {
                    return true;
                }
            }
        }
    }

    false
}

async fn list_videos() -> Json<serde_json::Value> {
    let mut videos = Vec::new();
    if let Ok(mut entries) = fs::read_dir("public/videos").await {
        while let Ok(Some(entry)) = entries.next_entry().await {
            if let Ok(name) = entry.file_name().into_string() {
                if !name.starts_with('.') {
                    let path = std::path::Path::new(&name);
                    let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
                    if ext == "mp4" || ext == "mkv" || ext == "avi" || ext == "mov" || ext == "webm" {
                        let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");

                        // Check and auto-convert SRT to VTT if needed
                        let has_subtitles = check_and_convert_srt(stem).await;
                        let subtitle_name = format!("{}.vtt", stem);

                        videos.push(serde_json::json!({
                            "name": name.clone(),
                            "has_subtitles": has_subtitles,
                            "subtitle_url": if has_subtitles {
                                Some(format!("/videos/{}", subtitle_name))
                            } else {
                                None
                            }
                        }));
                    }
                }
            }
        }
    }
    Json(serde_json::json!(videos))
}

async fn cast_video(
    State(state): State<AppState>,
    Json(payload): Json<serde_json::Value>,
) -> String {
    if let Some(filename) = payload.get("filename").and_then(|v| v.as_str()) {
        let video_url = format!("/videos/{}", filename);

        // Check if subtitle exists
        let path = std::path::Path::new(filename);
        let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");

        let has_subtitles = check_and_convert_srt(stem).await;
        let subtitle_name = format!("{}.vtt", stem);

        let subtitle_url = if has_subtitles {
            Some(format!("/videos/{}", subtitle_name))
        } else {
            None
        };

        let msg = serde_json::json!({
            "url": video_url,
            "subtitleUrl": subtitle_url
        }).to_string();

        if let Ok(mut current) = state.current_video.lock() {
            *current = Some(msg.clone());
        }

        let _ = state.tx.send(msg);
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
    let initial_msg = {
        let current = state.current_video.lock().unwrap();
        current.clone()
    };

    if let Some(msg) = initial_msg {
        let _ = socket.send(Message::Text(msg)).await;
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
        let msg = serde_json::json!({
            "url": video_url,
            "subtitleUrl": serde_json::Value::Null
        }).to_string();

        if let Ok(mut current) = state.current_video.lock() {
            *current = Some(msg.clone());
        }

        let _ = state.tx.send(msg);

        return "Uploaded & Playing".into();
    }

    "No file".into()
}

// Helper to convert SRT subtitle to WebVTT format
fn srt_to_vtt(srt_content: &str) -> String {
    let mut vtt_content = String::new();
    if !srt_content.trim_start().starts_with("WEBVTT") {
        vtt_content.push_str("WEBVTT\n\n");
    }

    for line in srt_content.lines() {
        if line.contains("-->") {
            let formatted_line = line.replace(',', ".");
            vtt_content.push_str(&formatted_line);
        } else {
            vtt_content.push_str(line);
        }
        vtt_content.push('\n');
    }

    vtt_content
}

// Upload subtitle
async fn upload_subtitle(
    State(_state): State<AppState>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    let mut video_name = String::new();
    let mut subtitle_data = None;
    let mut subtitle_filename = String::new();

    while let Some(field) = multipart.next_field().await.unwrap() {
        let name = field.name().unwrap_or("").to_string();
        if name == "video_name" {
            video_name = field.text().await.unwrap_or_default();
        } else if name == "file" {
            subtitle_filename = field.file_name().unwrap_or("").to_string();
            if let Ok(bytes) = field.bytes().await {
                subtitle_data = Some(bytes);
            }
        }
    }

    if video_name.is_empty() || subtitle_data.is_none() {
        return (axum::http::StatusCode::BAD_REQUEST, "Missing video_name or file").into_response();
    }

    let subtitle_bytes = subtitle_data.unwrap();
    // Use lossy string conversion to handle various text encodings safely
    let subtitle_str = String::from_utf8_lossy(&subtitle_bytes).into_owned();

    // Case-insensitive check for .srt extension
    let final_vtt = if subtitle_filename.to_lowercase().ends_with(".srt") {
        srt_to_vtt(&subtitle_str)
    } else {
        subtitle_str
    };

    let video_path = std::path::Path::new(&video_name);
    let stem = video_path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
    if stem.is_empty() {
        return (axum::http::StatusCode::BAD_REQUEST, "Invalid video filename").into_response();
    }

    let subtitle_filename = format!("{}.vtt", stem);
    let filepath = format!("public/videos/{}", subtitle_filename);

    if let Ok(mut file) = File::create(&filepath).await {
        if file.write_all(final_vtt.as_bytes()).await.is_ok() {
            return (axum::http::StatusCode::OK, "Subtitle uploaded successfully").into_response();
        }
    }

    (axum::http::StatusCode::INTERNAL_SERVER_ERROR, "Failed to save subtitle").into_response()
}