const ws = new WebSocket("ws://" + location.host + "/ws");

let isPlaybackBlocked = false;

document.body.addEventListener('click', async () => {
  if (isPlaybackBlocked) {
    const player = document.getElementById("player");
    const statusContainer = document.getElementById("status-container");
    try {
      await player.play();
      document.body.classList.add("playing");
      statusContainer.classList.remove("loading");
      isPlaybackBlocked = false;
    } catch (err) {
      console.error("Still blocked:", err);
    }
  }
});

ws.onmessage = async (event) => {
  const data = JSON.parse(event.data);
  const player = document.getElementById("player");
  const heading = document.getElementById("heading");
  const subtext = document.getElementById("subtext");
  const statusContainer = document.getElementById("status-container");

  // Show loading state
  statusContainer.classList.add("loading");
  heading.innerText = "Loading Video...";
  subtext.innerText = "Connecting stream...";
  
  player.src = data.url;
  
  player.onerror = () => {
    statusContainer.classList.remove("loading");
    console.error("Video format not supported:", player.error);
    heading.innerText = "Unsupported Format";
    subtext.innerText = "This video format or codec cannot be played on your current device.";
    document.body.classList.remove("playing");
  };

  try {
    await player.play();
    document.body.classList.add("playing");
    statusContainer.classList.remove("loading");
    isPlaybackBlocked = false;
  } catch (err) {
    statusContainer.classList.remove("loading");
    console.error("Playback failed:", err);
    heading.innerText = "Playback Blocked";
    subtext.innerText = "Please tap anywhere on this screen to allow video playback.";
    isPlaybackBlocked = true;
  }
};
