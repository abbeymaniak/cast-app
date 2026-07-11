/* ===================================================
   ES5-compatible player for Smart TV browsers
   - No const/let, no arrow functions, no async/await
   - No fetch(), no for...of, no template literals
   - Uses XMLHttpRequest and callbacks only
   =================================================== */

var ws = new WebSocket("ws://" + location.host + "/ws");
var isPlaybackBlocked = false;
var subtitleCues = [];
var subtitleInterval = null;

document.body.addEventListener("click", function () {
  if (isPlaybackBlocked) {
    var player = document.getElementById("player");
    var statusContainer = document.getElementById("status-container");
    var playPromise = player.play();
    if (playPromise && playPromise.then) {
      playPromise.then(function () {
        document.body.className = "playing";
        statusContainer.className = "status-container";
        isPlaybackBlocked = false;
      });
    } else {
      // Older browsers where play() doesn't return a promise
      document.body.className = "playing";
      statusContainer.className = "status-container";
      isPlaybackBlocked = false;
    }
  }
});

// ---- VTT Parser (ES5) ----

function parseVTT(vttText) {
  var cues = [];
  var normalized = vttText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  var blocks = normalized.split(/\n\n+/);

  for (var b = 0; b < blocks.length; b++) {
    var lines = blocks[b].replace(/^\s+|\s+$/g, "").split("\n");
    var timeLine = -1;

    for (var i = 0; i < lines.length; i++) {
      if (lines[i].indexOf("-->") !== -1) {
        timeLine = i;
        break;
      }
    }

    if (timeLine === -1) continue;

    var timeParts = lines[timeLine].split("-->");
    if (timeParts.length !== 2) continue;

    var start = parseTimestamp(timeParts[0].replace(/^\s+|\s+$/g, ""));
    var end = parseTimestamp(timeParts[1].replace(/^\s+|\s+$/g, ""));

    if (isNaN(start) || isNaN(end)) continue;

    var textLines = [];
    for (var j = timeLine + 1; j < lines.length; j++) {
      textLines.push(lines[j]);
    }
    var text = textLines.join("\n").replace(/^\s+|\s+$/g, "");
    if (text) {
      cues.push({ start: start, end: end, text: text });
    }
  }

  return cues;
}

function parseTimestamp(ts) {
  // Remove any positioning metadata after the timestamp
  ts = ts.split(" ")[0];
  var parts = ts.split(":");
  if (parts.length === 3) {
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  } else if (parts.length === 2) {
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return NaN;
}

// ---- Subtitle sync engine (ES5) ----

function startSubtitleSync(player) {
  var subtitleText = document.getElementById("subtitle-text");
  stopSubtitleSync();

  subtitleInterval = setInterval(function () {
    var currentTime = player.currentTime;
    var activeText = "";

    for (var i = 0; i < subtitleCues.length; i++) {
      if (currentTime >= subtitleCues[i].start && currentTime <= subtitleCues[i].end) {
        activeText = subtitleCues[i].text;
        break;
      }
    }

    subtitleText.innerHTML = activeText.replace(/\n/g, "<br>");
  }, 200);
}

function stopSubtitleSync() {
  if (subtitleInterval) {
    clearInterval(subtitleInterval);
    subtitleInterval = null;
  }
  var subtitleText = document.getElementById("subtitle-text");
  if (subtitleText) {
    subtitleText.innerHTML = "";
  }
}

// ---- Fetch VTT using XMLHttpRequest (ES5) ----

function fetchSubtitles(url, callback) {
  var xhr = new XMLHttpRequest();
  xhr.open("GET", url, true);
  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4) {
      if (xhr.status === 200) {
        callback(null, xhr.responseText);
      } else {
        callback("HTTP " + xhr.status);
      }
    }
  };
  xhr.onerror = function () {
    callback("Network error");
  };
  xhr.send();
}

// ---- Attempt playback (ES5) ----

function attemptPlayback(player, statusContainer) {
  var playPromise = player.play();
  if (playPromise && playPromise.then) {
    playPromise.then(function () {
      document.body.className = "playing";
      statusContainer.className = "status-container";
      isPlaybackBlocked = false;
    })["catch"](function (err) {
      statusContainer.className = "status-container";
      console.error("Playback failed:", err);
      document.getElementById("heading").innerText = "Playback Blocked";
      document.getElementById("subtext").innerText = "Please tap anywhere on this screen to allow video playback.";
      isPlaybackBlocked = true;
    });
  } else {
    // Older browsers where play() doesn't return a promise
    document.body.className = "playing";
    statusContainer.className = "status-container";
    isPlaybackBlocked = false;
  }
}

// ---- WebSocket message handler (ES5) ----

ws.onmessage = function (event) {
  var data = JSON.parse(event.data);
  var player = document.getElementById("player");
  var heading = document.getElementById("heading");
  var subtext = document.getElementById("subtext");
  var statusContainer = document.getElementById("status-container");

  // Show loading state
  statusContainer.className = "status-container loading";
  heading.innerText = "Loading Video...";
  subtext.innerText = "Connecting stream...";

  // Stop any active subtitle sync
  stopSubtitleSync();
  subtitleCues = [];

  player.src = data.url;

  player.onerror = function () {
    statusContainer.className = "status-container";
    console.error("Video format not supported:", player.error);
    heading.innerText = "Unsupported Format";
    subtext.innerText = "This video format or codec cannot be played on your current device.";
    document.body.className = "";
    stopSubtitleSync();
  };

  // Load subtitles using XMLHttpRequest then start playback
  if (data.subtitleUrl) {
    fetchSubtitles(data.subtitleUrl, function (err, vttText) {
      if (!err && vttText) {
        subtitleCues = parseVTT(vttText);
        console.log("Loaded " + subtitleCues.length + " subtitle cues");
        startSubtitleSync(player);
      } else {
        console.error("Failed to fetch subtitles:", err);
      }
    });
  }

  attemptPlayback(player, statusContainer);
};
