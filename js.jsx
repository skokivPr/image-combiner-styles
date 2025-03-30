/* Image Combiner Pro - Styles
 * Version: 1.0.1
 * Author: skoki
 * GitHub: https://github.com/skokivPr
 */
// DOM Elements
const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const imagePreview = document.getElementById("imagePreview");
const combineBtn = document.getElementById("combineBtn");
const clearBtn = document.getElementById("clearBtn");
const loading = document.getElementById("loading");
const resultContainer = document.getElementById("resultContainer");
const resultImage = document.getElementById("resultImage");
const downloadBtn = document.getElementById("downloadBtn");
const helpButton = document.getElementById("helpButton");
const description = document.querySelector(".description");
const welcomeModal = document.getElementById("welcomeModal");
const numberingPanel = document.getElementById("numberingPanel");
const numberingContent = document.getElementById("numberingContent");
const numberingBtn = document.getElementById("numberingBtn");

// State
let imageFiles = [];
let draggedItem = null;

// Event Listeners
window.addEventListener("load", () => {
    welcomeModal.style.display = "flex";
});

dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith("image/"));
    handleFiles(files);
});

dropZone.addEventListener("click", () => {
    fileInput.click();
});

fileInput.addEventListener("change", (e) => {
    const files = Array.from(e.target.files);
    handleFiles(files);
});

clearBtn.addEventListener("click", () => {
    imagePreview.innerHTML = "";
    imageFiles = [];
    resultContainer.style.display = "none";
    document.querySelector('.result-actions').classList.remove('visible');
    updateButtons();
});

combineBtn.addEventListener("click", () => {
    loading.style.display = "block";
    combineImages(imageFiles);
});

helpButton.addEventListener("click", () => {
    const isHidden = description.style.display === "none" || !description.style.display;
    description.style.display = isHidden ? "block" : "none";
    helpButton.querySelector("i").className = isHidden ? "fas fa-times" : "fas fa-question";
});

numberingBtn.addEventListener("click", () => {
    if (imageFiles.length > 0) {
        toggleNumberingPanel();
    }
});

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        closeModal();
    }
});

// Functions
function closeWelcomeModal() {
    welcomeModal.style.display = "none";
}

function handleFiles(files) {
    files.forEach(file => {
        if (file.type.startsWith("image/")) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const result = e.target.result;
                addImagePreview(result, file.name);
                imageFiles.push(result);
                updateButtons();
                document.querySelector('.controls').classList.add('visible');
            };
            reader.readAsDataURL(file);
        }
    });
}

function addImagePreview(src, name) {
    const previewItem = document.createElement("div");
    previewItem.className = "preview-item";
    previewItem.draggable = true;
    const position = imagePreview.children.length + 1;

    previewItem.innerHTML = `
        <div class="position-number">${position}</div>
        <img src="${src}" alt="${name}">
        <div class="preview-description">
            <input type="text" placeholder="Dodaj opis..." value="${name}">
            <div class="temp-description"></div>
        </div>
        <div class="zoom-icon" onclick="openModal('${src}')">
            <i class="fas fa-eye"></i>
        </div>
        <button class="remove-btn" onclick="removeImage(this)">
            <i class="bi bi-x"></i>
        </button>
    `;

    const descriptionInput = previewItem.querySelector(".preview-description input");
    descriptionInput.addEventListener("input", (e) => {
        const newDescription = e.target.value;
        const index = Array.from(imagePreview.children).indexOf(previewItem);
        const numberingInput = numberingContent.children[index]?.querySelector(".numbering-item-input");
        if (numberingInput) {
            numberingInput.value = newDescription;
        }
        showTempDescription(e.target.parentElement, newDescription);
    });

    previewItem.addEventListener("dragstart", handleDragStart);
    previewItem.addEventListener("dragend", handleDragEnd);
    previewItem.addEventListener("dragover", handleDragOver);
    previewItem.addEventListener("drop", handleDrop);
    previewItem.addEventListener("dragenter", handleDragEnter);
    previewItem.addEventListener("dragleave", handleDragLeave);

    imagePreview.appendChild(previewItem);
    updatePositionNumbers();
}

function updatePositionNumbers() {
    const items = imagePreview.querySelectorAll(".preview-item");
    items.forEach((item, index) => {
        const number = item.querySelector(".position-number");
        if (number) {
            number.textContent = index + 1;
        }
    });
}

function handleDragStart(e) {
    draggedItem = this;
    this.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    const index = Array.from(imagePreview.children).indexOf(this);
    e.dataTransfer.setData("text/plain", index.toString());
}

function handleDragEnd() {
    this.classList.remove("dragging");
    const items = document.querySelectorAll(".preview-item");
    items.forEach(item => item.classList.remove("drag-over"));
    draggedItem = null;
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
}

function handleDragEnter(e) {
    e.preventDefault();
    if (this !== draggedItem) {
        this.classList.add("drag-over");
    }
}

function handleDragLeave() {
    this.classList.remove("drag-over");
}

function handleDrop(e) {
    e.preventDefault();
    if (this !== draggedItem) {
        const fromIndex = parseInt(e.dataTransfer.getData("text/plain"));
        const toIndex = Array.from(imagePreview.children).indexOf(this);

        const movedFile = imageFiles[fromIndex];
        imageFiles.splice(fromIndex, 1);
        imageFiles.splice(toIndex, 0, movedFile);

        const items = [...imagePreview.querySelectorAll(".preview-item")];
        const movedElement = items[fromIndex];

        if (fromIndex < toIndex) {
            this.parentNode.insertBefore(movedElement, this.nextSibling);
        } else {
            this.parentNode.insertBefore(movedElement, this);
        }

        requestAnimationFrame(updatePositionNumbers);
    }
    this.classList.remove("drag-over");
}

function removeImage(button) {
    const previewItem = button.parentElement;
    const index = Array.from(imagePreview.children).indexOf(previewItem);
    imageFiles.splice(index, 1);
    previewItem.remove();
    updateButtons();
    updatePositionNumbers();
    if (imageFiles.length === 0) {
        document.querySelector('.controls').classList.remove('visible');
    }
}

function updateButtons() {
    combineBtn.disabled = imageFiles.length < 2;
    clearBtn.disabled = imageFiles.length === 0;
}

function combineImages(files) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const images = [];
    let loadedImages = 0;

    files.forEach((file, index) => {
        const img = new Image();
        img.src = file;
        img.onload = () => {
            images[index] = img;
            loadedImages++;

            if (loadedImages === files.length) {
                const maxWidth = Math.max(...images.map(img => img.width));
                const totalHeight = images.reduce((sum, img) => sum + img.height, 0);

                canvas.width = maxWidth;
                canvas.height = totalHeight;

                ctx.clearRect(0, 0, canvas.width, canvas.height);

                let yOffset = 0;
                images.forEach(img => {
                    const xOffset = (maxWidth - img.width) / 2;
                    ctx.drawImage(img, xOffset, yOffset);
                    yOffset += img.height;
                });

                const dataUrl = canvas.toDataURL("image/png");
                resultImage.src = dataUrl;
                resultContainer.style.display = "block";
                loading.style.display = "none";
                document.querySelector('.result-actions').classList.add('visible');

                downloadBtn.onclick = () => {
                    const link = document.createElement("a");
                    const date = new Date();
                    const dateStr = date.toISOString().split('T')[0];
                    const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, '-');
                    link.download = `grafik_${dateStr}_${timeStr}.png`;
                    link.href = dataUrl;
                    link.click();
                };
            }
        };
    });
}

function openModal(src) {
    const modal = document.getElementById("imageModal");
    const modalImage = document.getElementById("modalImage");
    modalImage.src = src;
    modal.style.display = "block";
    document.body.style.overflow = "hidden";
}

function closeModal() {
    const modal = document.getElementById("imageModal");
    modal.style.display = "none";
    document.body.style.overflow = "";
}

function toggleNumberingPanel() {
    numberingPanel.classList.toggle("active");
    if (numberingPanel.classList.contains("active")) {
        updateNumberingPanel();
    }
}

function updateNumberingPanel() {
    numberingContent.innerHTML = "";
    const previewItems = imagePreview.querySelectorAll(".preview-item");

    previewItems.forEach((item, index) => {
        const img = item.querySelector("img");
        const input = item.querySelector(".preview-description input");
        const currentDescription = input ? input.value : "";

        const numberingItem = document.createElement("div");
        numberingItem.className = "numbering-item";
        numberingItem.innerHTML = `
            <div class="numbering-item-header">
                <div class="numbering-item-number">${index + 1}</div>
            </div>
            <div class="numbering-item-preview">
                <img src="${img.src}" alt="Podgląd">
                <button class="numbering-preview-btn" onclick="openModal('${img.src}')">
                    <i class="fas fa-eye"></i>
                </button>
            </div>
            <textarea class="numbering-item-input" 
                data-index="${index}" 
                placeholder="Dodaj opis..." 
                rows="3">${currentDescription}</textarea>
        `;

        const textarea = numberingItem.querySelector(".numbering-item-input");
        if (textarea) {
            textarea.addEventListener("input", (e) => {
                const newDescription = e.target.value;
                const previewInput = imagePreview.children[index]?.querySelector(".preview-description input");
                if (previewInput) {
                    previewInput.value = newDescription;
                    showTempDescription(previewInput.parentElement, newDescription);
                }
            });
        }

        numberingContent.appendChild(numberingItem);
    });
}

function showTempDescription(element, text) {
    const tempDesc = element.querySelector(".temp-description");
    tempDesc.textContent = text;
    tempDesc.classList.add("show");

    setTimeout(() => {
        tempDesc.classList.remove("show");
    }, 5000);
}

function applyNumbering() {
    const inputs = numberingContent.querySelectorAll(".numbering-item-input");
    inputs.forEach((input, index) => {
        const previewItem = imagePreview.children[index];
        if (previewItem) {
            const descriptionInput = previewItem.querySelector(".preview-description input");
            const newDescription = input.value;
            descriptionInput.value = newDescription;
            showTempDescription(previewItem.querySelector(".preview-description"), newDescription);
        }
    });
    toggleNumberingPanel();
}

// Theme Toggle
const toggleTheme = () => {
    const root = document.documentElement;
    const currentTheme = root.getAttribute("data-theme");
    const newTheme = currentTheme === "dark" ? "light" : "dark";

    root.setAttribute("data-theme", newTheme);
    localStorage.setItem("theme", newTheme);
    themeToggleButton.innerHTML = newTheme === "dark" ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
};

const themeToggleButton = document.createElement("button-theme");
themeToggleButton.innerHTML = '<i class="fas fa-moon"></i>';
themeToggleButton.onclick = toggleTheme;
document.body.appendChild(themeToggleButton);

const savedTheme = localStorage.getItem("theme");
if (savedTheme) {
    document.documentElement.setAttribute("data-theme", savedTheme);
    themeToggleButton.innerHTML = savedTheme === "dark" ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
} else {
    localStorage.setItem("theme", "light");
} 
