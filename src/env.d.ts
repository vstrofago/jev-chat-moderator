interface ImportMetaEnv {
  /** "true" in the Docker image, where nginx proxies /typesafe-api to api.typesafe.ai. */
  readonly PUBLIC_TYPESAFE_LOCAL_PROXY?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
