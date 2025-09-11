import { Scenes } from "telegraf";
import type { MyContext } from "..";
import { address } from "./address";

export const mainStage = new Scenes.Stage<MyContext>([address]);
