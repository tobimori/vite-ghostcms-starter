import { copyFileSync } from "node:fs"
import { resolve } from "node:path"
import { defineConfig, loadEnv } from "vite"
import tsconfigPaths from "vite-tsconfig-paths"
import zlib from "node:zlib"

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "")

    copyFileSync(resolve(__dirname, "package.json"), resolve(__dirname, "theme/package.json"))

    return {
        build: {
            manifest: false, // disable Vite's default manifest,
            outDir: "theme/assets",
            emptyOutDir: true,
            rollupOptions: {
                input: ["src/index.ts", "src/index.css"],
                output: {
                    entryFileNames: "[name].js",
                    assetFileNames: "[name][extname]"
                }
            }
        },
        plugins: [tsconfigPaths()],
        server: {
            proxy: {
                // we proxy anything except the folders our vite dev assets are in
                "^(?!/src|/node_modules|/@vite|/@react-refresh).*$": {
                    target: env.GHOST_DEV_URL,
                    secure: false,
                    changeOrigin: true,
                    selfHandleResponse: true,
                    configure: (proxy) => {
                        proxy.on("proxyRes", (proxyRes, _, res) => {
                            const chunks: Uint8Array[] = []

                            // Buffer complete response
                            proxyRes.on("data", (chunk) => chunks.push(chunk))

                            // Process the response when it ends
                            proxyRes.on("end", () => {
                                const buffer = Buffer.concat(chunks)
                                const encoding = proxyRes.headers["content-encoding"]

                                // Function to modify the response body
                                const modifyResponse = (body: string) => {
                                    // Modify the response body by injecting scripts before the closing </head> tag
                                    const modifiedBody = body.replace(
                                        /<!-- start assets -->([\s\S]*)<!-- end assets -->/,
                                        `
											<!-- start vite dev mode -->
											<script type="module" src="http://localhost:5173/@vite/client"></script>
											<script type="module" src="http://localhost:5173/src/index.css"></script>
											<script type="module" src="http://localhost:5173/src/index.ts"></script>
											<!-- end vite dev mode -->
                                        `
                                    )

                                    // Write the modified response body and end the response
                                    res.write(modifiedBody)
                                    res.end()
                                }

                                if (encoding === "gzip" || encoding === "deflate") {
                                    // Unzip the response buffer
                                    zlib.unzip(buffer, (err, buffer) => {
                                        if (!err) {
                                            const remoteBody = buffer.toString()
                                            modifyResponse(remoteBody)
                                        } else {
                                            console.error(err)
                                        }
                                    })
                                } else {
                                    // Handle non-gzipped response
                                    const remoteBody = buffer.toString()
                                    modifyResponse(remoteBody)
                                }
                            })
                        })
                    }
                }
            }
        }
    }
})
