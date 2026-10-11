import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { installNativeDownloads } from "./lib/nativeDownload";

installNativeDownloads();
createRoot(document.getElementById("root")!).render(<App />);
