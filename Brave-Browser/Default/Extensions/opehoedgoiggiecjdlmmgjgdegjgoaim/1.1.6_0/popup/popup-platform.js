// Chrome import handler: inline FileReader + drag-drop. The Chrome popup
// survives the file picker, so we can read + apply JSON without leaving the
// popup context.
function initPlatformImport({ importDataBtn, showNotification, loadDarkMode, loadSettings, notifyContentScript }) {
  function processImportFile(file) {
    if (!file) {
      showNotification('No file selected', 'error');
      return;
    }

    if (!file.name.endsWith('.json')) {
      showNotification('Please select a JSON file', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        browser.storage.local.set(data).then(() => {
          showNotification('Data imported successfully');
          setTimeout(() => {
            loadDarkMode();
            loadSettings();
            notifyContentScript();
          }, 100);
        }).catch(error => {
          showNotification('Import failed: ' + error.message, 'error');
        });
      } catch (error) {
        showNotification('Invalid JSON file', 'error');
      }
    };
    reader.readAsText(file);
  }

  const dropZone = document.body;
  let dragCounter = 0;

  dropZone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    if (dragCounter === 1) {
      dropZone.classList.add('drag-over');
    }
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter === 0) {
      dropZone.classList.remove('drag-over');
    }
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    dropZone.classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processImportFile(files[0]);
    }
  });

  importDataBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.style.display = 'none';

    input.onchange = (e) => {
      processImportFile(e.target.files[0]);
      document.body.removeChild(input);
    };

    document.body.appendChild(input);
    input.click();
  });
}