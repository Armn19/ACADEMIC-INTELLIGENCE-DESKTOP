const {
    app,
    BrowserWindow,
    WebContentsView,
    ipcMain
} = require("electron");

const path = require("path");
const fs = require("fs");

// Dedicated writable Chromium cache directory
const cacheRoot = path.join(
    app.getPath("appData"),
    "Academic Intelligence Desktop"
);

fs.mkdirSync(path.join(cacheRoot, "Cache"), { recursive: true });
fs.mkdirSync(path.join(cacheRoot, "GPUCache"), { recursive: true });

app.setPath("userData", cacheRoot);
app.setPath("cache", path.join(cacheRoot, "Cache"));

app.commandLine.appendSwitch(
    "disk-cache-dir",
    path.join(cacheRoot, "Cache")
);

app.commandLine.appendSwitch(
    "gpu-cache-dir",
    path.join(cacheRoot, "GPUCache")
);

let mainWindow;
let browserView;

const SIDEBAR_WIDTH = 215;
const BROWSER_TOP = 190;

function updateBrowserBounds() {
    if (!mainWindow || !browserView) return;

    const [width, height] = mainWindow.getContentSize();

    browserView.setBounds({
        x: SIDEBAR_WIDTH,
        y: BROWSER_TOP,
        width: Math.max(1, width - SIDEBAR_WIDTH),
        height: Math.max(1, height - BROWSER_TOP)
    });
}

function hideBrowser() {
    if (!browserView) return;

    browserView.setBounds({
        x: SIDEBAR_WIDTH,
        y: BROWSER_TOP,
        width: 1,
        height: 1
    });
}

function showBrowser() {
    if (!mainWindow) return;

    if (!browserView) {
        browserView = new WebContentsView({
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: true
            }
        });

        mainWindow.contentView.addChildView(browserView);

        browserView.webContents.setWindowOpenHandler(() => ({
            action: "deny"
        }));

        browserView.webContents.on("will-navigate", (event, url) => {
            try {
                const protocol = new URL(url).protocol;

                if (!["https:", "http:"].includes(protocol)) {
                    event.preventDefault();
                }
            } catch {
                event.preventDefault();
            }
        });

        browserView.webContents.loadURL("https://www.google.com");
    }

    updateBrowserBounds();
}

function normalizeUrl(input) {
    let value = String(input || "").trim();

    if (!value) {
        throw new Error("Enter a web address.");
    }

    if (!/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value)) {
        value = "https://" + value;
    }

    const parsed = new URL(value);

    if (!["https:", "http:"].includes(parsed.protocol)) {
        throw new Error("Only HTTP and HTTPS addresses are allowed.");
    }

    return parsed.href;
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1000,
        minHeight: 650,
        title: "Academic Intelligence Desktop",
        backgroundColor: "#0d1117",
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    });

    mainWindow.loadFile(
        path.join(__dirname, "../Dashboard/index.html")
    );

    mainWindow.on("resize", updateBrowserBounds);

    mainWindow.on("closed", () => {
        if (browserView && !browserView.webContents.isDestroyed()) {
            browserView.webContents.close();
        }

        browserView = null;
        mainWindow = null;
    });
}

function validSender(event) {
    return mainWindow &&
        event.sender === mainWindow.webContents;
}

ipcMain.on("browser:show", (event) => {
    if (validSender(event)) showBrowser();
});

ipcMain.on("browser:hide", (event) => {
    if (validSender(event)) hideBrowser();
});

ipcMain.handle("browser:navigate", async (event, input) => {
    if (!validSender(event) || !browserView) {
        return { ok: false, error: "Browser is not available." };
    }

    try {
        const url = normalizeUrl(input);
        await browserView.webContents.loadURL(url);

        return { ok: true, url };
    } catch (error) {
        return { ok: false, error: error.message };
    }
});

ipcMain.handle("browser:back", (event) => {
    if (!validSender(event) || !browserView) return false;

    if (browserView.webContents.canGoBack()) {
        browserView.webContents.goBack();
        return true;
    }

    return false;
});

ipcMain.handle("browser:forward", (event) => {
    if (!validSender(event) || !browserView) return false;

    if (browserView.webContents.canGoForward()) {
        browserView.webContents.goForward();
        return true;
    }

    return false;
});

ipcMain.handle("browser:reload", (event) => {
    if (!validSender(event) || !browserView) return false;

    browserView.webContents.reload();
    return true;
});

app.whenReady().then(createWindow);

app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});


// ==========================================
// UNIVERSAL INSPECTION ENGINE
// ==========================================

ipcMain.handle("inspection:page", async (event) => {
    if (!validSender(event) || !browserView) {
        return {
            ok: false,
            error: "Browser is not available."
        };
    }

    try {
        const result = await browserView.webContents.executeJavaScript(`
            (() => {
                const getVisible = (element) => {
                    const style = window.getComputedStyle(element);
                    const rect = element.getBoundingClientRect();

                    return style.display !== "none" &&
                        style.visibility !== "hidden" &&
                        rect.width > 0 &&
                        rect.height > 0;
                };

                const collect = (root, selector) => {
                    return Array.from(root.querySelectorAll(selector));
                };

                const buttons = collect(
                    document,
                    'button, input[type="button"], input[type="submit"], [role="button"]'
                ).filter(getVisible).map(element => ({
                    tag: element.tagName,
                    text: (element.innerText || element.value || element.getAttribute("aria-label") || "").trim(),
                    type: element.type || "",
                    id: element.id || "",
                    disabled: !!element.disabled
                }));

                const inputs = collect(
                    document,
                    "input, textarea, select"
                ).filter(getVisible).map(element => ({
                    tag: element.tagName,
                    type: element.type || "",
                    name: element.name || "",
                    placeholder: element.placeholder || "",
                    label: element.getAttribute("aria-label") || "",
                    id: element.id || "",
                    disabled: !!element.disabled
                }));

                const links = collect(
                    document,
                    "a[href]"
                ).filter(getVisible).map(element => ({
                    text: (element.innerText || "").trim(),
                    href: element.href
                }));

                const iframes = collect(
                    document,
                    "iframe"
                ).map(element => ({
                    title: element.title || "",
                    src: element.src || "",
                    accessible: (() => {
                        try {
                            return !!element.contentDocument;
                        } catch {
                            return false;
                        }
                    })()
                }));

                const text = (document.body?.innerText || "")
                    .replace(/\\s+/g, " ")
                    .trim()
                    .slice(0, 12000);

                return {
                    title: document.title,
                    url: location.href,
                    text,
                    buttons: buttons.slice(0, 150),
                    inputs: inputs.slice(0, 150),
                    links: links.slice(0, 200),
                    iframes: iframes.slice(0, 50),
                    inspectedAt: new Date().toISOString()
                };
            })()
        `, true);

        return {
            ok: true,
            data: result
        };

    } catch (error) {
        return {
            ok: false,
            error: error.message
        };
    }
});

