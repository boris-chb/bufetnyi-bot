import type { Scenes, Context } from "telegraf";

export interface AppSceneSession extends Scenes.SceneSessionData {
  sceneSessionProp: string;
}

export interface AppContext extends Context {
  session: AppSession;
  scene: Scenes.SceneContextScene<AppContext, AppSceneSession>;
  path: string;
}

export interface AppSession extends Scenes.SceneSession<AppSceneSession> {}
