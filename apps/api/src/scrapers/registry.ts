import type { ScraperAJ } from "./tipos"
import { AjRuizScraper } from "./aj-ruiz"

const scrapers: ScraperAJ[] = [
  new AjRuizScraper(),
]

export function getScraperByUrlBase(urlBase: string): ScraperAJ | undefined {
  return scrapers.find((s) => s.urlBase === urlBase)
}

export function getAllScrapers(): ScraperAJ[] {
  return scrapers
}
