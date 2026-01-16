import { Scenes } from "telegraf";
import { address } from "./address";
import { AppContext } from "../context";

export const mainStage = new Scenes.Stage<AppContext>([address]);
