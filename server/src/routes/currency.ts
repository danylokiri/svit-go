import { Router } from "express";
import { SUPPORTED_CURRENCIES, CURRENCY_SYMBOL, getRates } from "../lib/currency.js";

export const currencyRouter = Router();

/**
 * GET /api/currency/rates
 *
 * Returns supported currencies, symbols and current EUR-based rates.
 * Cache: 1h browser + 1h CDN with SWR — these only refresh once a day anyway.
 */
currencyRouter.get("/rates", async (_req, res) => {
  const rates = await getRates();
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400");
  res.json({
    base: "EUR",
    rates,
    symbols: CURRENCY_SYMBOL,
    supported: SUPPORTED_CURRENCIES,
  });
});
