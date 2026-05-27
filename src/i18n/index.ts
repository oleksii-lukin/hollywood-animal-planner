import { createI18n } from 'vue-i18n'
import English from './locales/English.json'
import Ukrainian from './locales/Ukrainian.json'
import Belarusian from './locales/Belarusian.json'
import Chinese from './locales/Chinese.json'
import French from './locales/French.json'
import German from './locales/German.json'
import Japanese from './locales/Japanese.json'
import Portuguese from './locales/Portuguese.json'
import Spanish from './locales/Spanish.json'
import Russian from './locales/Russian.json'

export default createI18n({
  legacy: false,
  globalInjection: true,
  locale: 'English',
  fallbackLocale: 'English',
  messages: {
    English,
    Ukrainian,
    Belarusian,
    Chinese,
    French,
    German,
    Japanese,
    Portuguese,
    Spanish,
    Russian
  }
})
