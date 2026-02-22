import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';
export default defineConfig({
    base: process.env.GITHUB_ACTIONS ? '/hollywood-animal-planner/' : '/',
    plugins: [vue()],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url))
        }
    },
    optimizeDeps: {
        exclude: ['../../build/release.js']
    },
    assetsInclude: ['**/*.wasm'],
    // @ts-expect-error vitest extends vite config
    test: {
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        globals: true
    }
});
