import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import App from './App.vue'
import './style.css'

const THEME_KEY = 'hollywood-animal-planner-theme'
const savedTheme = localStorage.getItem(THEME_KEY)
if (savedTheme === 'warm') {
  document.documentElement.setAttribute('data-theme', 'warm')
} else if (savedTheme === 'valve' || savedTheme === 'clear') {
  document.documentElement.setAttribute('data-theme', 'valve')
}

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

const app = createApp(App)
app.use(pinia)
app.mount('#app')
