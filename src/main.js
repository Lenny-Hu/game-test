import { createApp } from 'vue'
import { Popup } from 'vant'
import App from './App.vue'

const app = createApp(App)
app.use(Popup)
app.mount('#app')
