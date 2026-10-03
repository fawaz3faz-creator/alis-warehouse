const urlInput = document.getElementById('productUrl');
const scanBtn = document.getElementById('scanBtn');
const downloadAllBtn = document.getElementById('downloadAllBtn');
const gallery = document.getElementById('gallery');
const statusText = document.getElementById('status');

let mediaItems = [];

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.style.color = isError ? '#b91c1c' : '#475467';
}

function downloadFile(url, filename) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function renderGallery() {
  gallery.innerHTML = '';

  if (!mediaItems.length) {
    gallery.innerHTML = '<div class="empty">No media found yet.</div>';
    return;
  }

  mediaItems.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = 'media-card';

    const preview = item.kind === 'video' ? document.createElement('video') : document.createElement('img');
    preview.className = 'media-preview';
    preview.src = item.url;
    preview.controls = item.kind === 'video';

    const meta = document.createElement('div');
    meta.className = 'media-meta';

    const name = document.createElement('span');
    name.className = 'media-name';
    name.textContent = item.name || `media-${index + 1}`;

    const kind = document.createElement('span');
    kind.className = 'media-kind';
    kind.textContent = item.kind === 'video' ? 'Video' : 'Image';

    const btn = document.createElement('button');
    btn.className = 'download-btn';
    btn.textContent = 'Download';
    btn.addEventListener('click', () => downloadFile(item.url, item.name || `media-${index + 1}`));

    meta.appendChild(name);
    meta.appendChild(kind);
    meta.appendChild(btn);

    card.appendChild(preview);
    card.appendChild(meta);
    gallery.appendChild(card);
  });
}

async function extractMedia() {
  const url = urlInput.value.trim();

  if (!url) {
    setStatus('Please enter a valid product URL.', true);
    return;
  }

  setStatus('Scanning link for product media...');

  try {
    const response = await fetch(`/api/extract?url=${encodeURIComponent(url)}`);
    const data = await response.json();

    if (!response.ok || !Array.isArray(data.media)) {
      throw new Error(data.detail || data.error || 'Extraction failed.');
    }

    mediaItems = data.media;
    renderGallery();

    if (!mediaItems.length) {
      setStatus(data.message || 'No media was found for that link.');
      return;
    }

    setStatus(`Found ${mediaItems.length} media item(s).`);
  } catch (error) {
    setStatus(error.message || 'Failed to scan the link.', true);
  }
}

downloadAllBtn.addEventListener('click', () => {
  if (!mediaItems.length) {
    setStatus('No media to download yet.', true);
    return;
  }

  mediaItems.forEach((item, index) => {
    setTimeout(() => {
      downloadFile(item.url, item.name || `media-${index + 1}`);
    }, index * 260);
  });

  setStatus(`Downloading ${mediaItems.length} media item(s).`);
});

scanBtn.addEventListener('click', extractMedia);
urlInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') extractMedia();
});

renderGallery();
