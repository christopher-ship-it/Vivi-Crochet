import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'preconnect-api',
      transformIndexHtml(html) {
        const api = process.env.VITE_API_BASE_URL?.replace(/\/$/, '')
        if (!api) return html
        return html.replace(
          '</head>',
          `    <link rel="dns-prefetch" href="${api}" />\n    <link rel="preconnect" href="${api}" crossorigin />\n  </head>`,
        )
      },
    },
  ],
})
