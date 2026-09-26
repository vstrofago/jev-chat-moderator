import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// Served under <landing base>/docs on GitHub Pages. SITE / BASE_PATH come from the Pages
// workflow; the defaults work locally.
const base = `${(process.env.BASE_PATH ?? "").replace(/\/$/, "")}/docs`;
const page = (slug, es, en) => ({ label: es, translations: { en }, slug });

export default defineConfig({
  site: process.env.SITE,
  base,
  integrations: [
    starlight({
      title: "Vigia",
      description: "Documentación de Vigia, el moderador de chat gratuito para streamers de Twitch.",
      logo: { light: "./src/assets/bat-ink.svg", dark: "./src/assets/bat-paper.svg" },
      favicon: "/favicon.svg",
      defaultLocale: "root",
      locales: {
        root: { label: "Español", lang: "es" },
        en: { label: "English", lang: "en" },
      },
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/vstrofago/vigia" }],
      editLink: { baseUrl: "https://github.com/vstrofago/vigia/edit/main/apps/docs/" },
      customCss: ["./src/styles/stoico.css"],
      sidebar: [
        page("index", "Qué es Vigia", "What Vigia is"),
        {
          label: "Empezar",
          translations: { en: "Get started" },
          items: [
            page("install", "Instalar la app", "Install the app"),
            page("keys", "Tus keys", "Your keys"),
            page("docker", "Docker en tu equipo", "Docker on your computer"),
            page("server", "Servidor para mods", "Server for mods"),
            page("cli", "Línea de comandos", "Command line"),
          ],
        },
        {
          label: "Usar Vigia",
          translations: { en: "Using Vigia" },
          items: [
            page("how-it-works", "Cómo decide", "How it decides"),
            page("rules", "Reglas", "Rules"),
            page("anti-spoiler", "Anti-spoiler", "Anti-spoiler"),
            page("commands", "Comandos del chat", "Chat commands"),
            page("overlay", "Overlay de OBS", "OBS overlay"),
          ],
        },
        {
          label: "Referencia",
          translations: { en: "Reference" },
          items: [
            page("privacy", "Privacidad", "Privacy"),
            page("accuracy", "Precisión", "Accuracy"),
            page("faq", "Preguntas frecuentes", "FAQ"),
            page("develop", "Desarrollo", "Develop"),
          ],
        },
      ],
    }),
  ],
});
