import { render } from "preact";
import "../styles/app.css";
import "../styles/dashboard.css";
import { App } from "./app";

render(<App />, document.getElementById("app")!);
