import type { ScraperAJ } from "./tipos"
import { AjRuizScraper } from "./aj-ruiz"
import { R4CScraper } from "./r4c"
import { OnBehalfScraper } from "./onbehalf"
import { PsvarScraper } from "./psvar"

const scrapers: ScraperAJ[] = [
  new AjRuizScraper(),
  new R4CScraper(),
  new OnBehalfScraper(),
  new PsvarScraper(),
]

export function getScraperByUrlBase(urlBase: string): ScraperAJ | undefined {
  return scrapers.find((s) => s.urlBase === urlBase)
}

export function getAllScrapers(): ScraperAJ[] {
  return scrapers
}
