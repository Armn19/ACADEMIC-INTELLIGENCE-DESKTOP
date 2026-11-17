const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("academicApp", {
    name: "Academic Intelligence Desktop",
    version: "1.0.0",

    showBrowser: () => ipcRenderer.send("browser:show"),
    hideBrowser: () => ipcRenderer.send("browser:hide"),

    navigate: (url) => ipcRenderer.invoke("browser:navigate", url),
    back: () => ipcRenderer.invoke("browser:back"),
    forward: () => ipcRenderer.invoke("browser:forward"),
    reload: () => ipcRenderer.invoke("browser:reload"),

    inspectPage: () => ipcRenderer.invoke("inspection:page")
});
