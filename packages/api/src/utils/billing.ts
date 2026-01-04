/**
 * Billing calculation utilities
 * Calculates costs from data ingestion metrics based on pricing model:
 * - Logs: $0.3 per GB ingested
 * - Traces: $0.3 per GB ingested
 * - Metrics: $0.1 per million samples (rows)
 */

export interface Pricing {
  logsPerGB: number;
  tracesPerGB: number;
  metricsPerMillionSamples: number;
}

export const DEFAULT_PRICING: Pricing = {
  logsPerGB: 0.3,
  tracesPerGB: 0.3,
  metricsPerMillionSamples: 0.1,
};

export interface IngestionBreakdown {
  logs: { bytes: number; rows: number };
  traces: { bytes: number; rows: number };
  metrics: { bytes: number; rows: number };
  sessions: { bytes: number; rows: number };
}

export interface CostBreakdown {
  logs: number;
  traces: number;
  metrics: number;
  sessions: number;
  total: number;
}

export interface BillingData {
  ingestion: IngestionBreakdown;
  costs: CostBreakdown;
  date?: string;
}

/**
 * Convert bytes to GB
 */
export function bytesToGB(bytes: number): number {
  return bytes / (1024 * 1024 * 1024);
}

/**
 * Convert rows to millions of samples
 */
export function rowsToMillions(rows: number): number {
  return rows / 1_000_000;
}

/**
 * Calculate costs from ingestion breakdown
 */
export function calculateCosts(
  breakdown: IngestionBreakdown,
  pricing: Pricing = DEFAULT_PRICING,
): CostBreakdown {
  // Logs: bytes to GB, then multiply by price per GB
  const logsGB = bytesToGB(breakdown.logs.bytes);
  const logsCost = logsGB * pricing.logsPerGB;

  // Traces: bytes to GB, then multiply by price per GB
  const tracesGB = bytesToGB(breakdown.traces.bytes);
  const tracesCost = tracesGB * pricing.tracesPerGB;

  // Metrics: rows to millions, then multiply by price per million
  const metricsMillions = rowsToMillions(breakdown.metrics.rows);
  const metricsCost = metricsMillions * pricing.metricsPerMillionSamples;

  // Sessions are not billed (cost is 0)
  const sessionsCost = 0;

  const total = logsCost + tracesCost + metricsCost + sessionsCost;

  return {
    logs: Math.round(logsCost * 100) / 100, // Round to 2 decimal places
    traces: Math.round(tracesCost * 100) / 100,
    metrics: Math.round(metricsCost * 100) / 100,
    sessions: 0,
    total: Math.round(total * 100) / 100,
  };
}

/**
 * Aggregate billing data by period
 */
export function aggregateBillingByPeriod(
  billingData: BillingData[],
): BillingData {
  const aggregated: IngestionBreakdown = {
    logs: { bytes: 0, rows: 0 },
    traces: { bytes: 0, rows: 0 },
    metrics: { bytes: 0, rows: 0 },
    sessions: { bytes: 0, rows: 0 },
  };

  for (const data of billingData) {
    aggregated.logs.bytes += data.ingestion.logs.bytes;
    aggregated.logs.rows += data.ingestion.logs.rows;
    aggregated.traces.bytes += data.ingestion.traces.bytes;
    aggregated.traces.rows += data.ingestion.traces.rows;
    aggregated.metrics.bytes += data.ingestion.metrics.bytes;
    aggregated.metrics.rows += data.ingestion.metrics.rows;
    aggregated.sessions.bytes += data.ingestion.sessions.bytes;
    aggregated.sessions.rows += data.ingestion.sessions.rows;
  }

  const costs = calculateCosts(aggregated);

  return {
    ingestion: aggregated,
    costs,
  };
}

/**
 * Forecast methods
 */
export enum ForecastMethod {
  CURRENT_RATE = 'current_rate',
  SEVEN_DAY_AVG = 'seven_day_avg',
  THIRTY_DAY_AVG = 'thirty_day_avg',
}

export interface ForecastResult {
  method: ForecastMethod;
  projectedMonthlyCost: number;
  projectedDailyCost: number;
  basedOnDays: number;
  description: string;
}

/**
 * Calculate forecast using current hourly rate
 */
function calculateCurrentRateForecast(
  currentHourlyCost: number,
): ForecastResult {
  const hourlyRate = currentHourlyCost;
  const dailyRate = hourlyRate * 24;
  const monthlyRate = dailyRate * 30; // Approximate month

  return {
    method: ForecastMethod.CURRENT_RATE,
    projectedMonthlyCost: Math.round(monthlyRate * 100) / 100,
    projectedDailyCost: Math.round(dailyRate * 100) / 100,
    basedOnDays: 0, // Current hour only
    description: 'Based on current hourly ingestion rate',
  };
}

/**
 * Calculate forecast using 7-day average
 */
function calculateSevenDayForecast(
  dailyCosts: number[],
): ForecastResult | null {
  if (dailyCosts.length === 0) {
    return null;
  }

  const avgDailyCost =
    dailyCosts.reduce((sum, cost) => sum + cost, 0) / dailyCosts.length;
  const monthlyCost = avgDailyCost * 30; // Approximate month

  return {
    method: ForecastMethod.SEVEN_DAY_AVG,
    projectedMonthlyCost: Math.round(monthlyCost * 100) / 100,
    projectedDailyCost: Math.round(avgDailyCost * 100) / 100,
    basedOnDays: dailyCosts.length,
    description: `Based on average of last ${dailyCosts.length} days`,
  };
}

/**
 * Calculate forecast using 30-day average
 */
function calculateThirtyDayForecast(
  dailyCosts: number[],
): ForecastResult | null {
  if (dailyCosts.length === 0) {
    return null;
  }

  const avgDailyCost =
    dailyCosts.reduce((sum, cost) => sum + cost, 0) / dailyCosts.length;
  const monthlyCost = avgDailyCost * 30; // Approximate month

  return {
    method: ForecastMethod.THIRTY_DAY_AVG,
    projectedMonthlyCost: Math.round(monthlyCost * 100) / 100,
    projectedDailyCost: Math.round(avgDailyCost * 100) / 100,
    basedOnDays: dailyCosts.length,
    description: `Based on average of last ${dailyCosts.length} days`,
  };
}

/**
 * Calculate forecasts using multiple methods
 */
export function calculateForecasts(
  currentHourlyCost: number,
  dailyCosts: number[],
): ForecastResult[] {
  const forecasts: ForecastResult[] = [];

  // Current rate forecast
  if (currentHourlyCost > 0) {
    forecasts.push(calculateCurrentRateForecast(currentHourlyCost));
  }

  // 7-day average (use last 7 days if available)
  const last7Days = dailyCosts.slice(-7);
  if (last7Days.length > 0) {
    const sevenDayForecast = calculateSevenDayForecast(last7Days);
    if (sevenDayForecast) {
      forecasts.push(sevenDayForecast);
    }
  }

  // 30-day average (use all available days, up to 30)
  const last30Days = dailyCosts.slice(-30);
  if (last30Days.length > 0) {
    const thirtyDayForecast = calculateThirtyDayForecast(last30Days);
    if (thirtyDayForecast) {
      forecasts.push(thirtyDayForecast);
    }
  }

  return forecasts;
}

/**
 * Calculate service-level billing from service metrics
 */
export interface ServiceBilling {
  serviceName: string;
  ingestion: IngestionBreakdown;
  costs: CostBreakdown;
  estimatedHourlyCost: number;
}

export function getServiceLevelBilling(
  serviceMetrics: Array<{
    serviceName: string;
    breakdown: IngestionBreakdown;
    estimatedBytesPerHour: number;
    estimatedRowsPerHour: number;
  }>,
  pricing: Pricing = DEFAULT_PRICING,
): ServiceBilling[] {
  const serviceMap = new Map<string, ServiceBilling>();

  for (const metric of serviceMetrics) {
    const existing = serviceMap.get(metric.serviceName);
    if (existing) {
      // Aggregate ingestion
      existing.ingestion.logs.bytes += metric.breakdown.logs.bytes;
      existing.ingestion.logs.rows += metric.breakdown.logs.rows;
      existing.ingestion.traces.bytes += metric.breakdown.traces.bytes;
      existing.ingestion.traces.rows += metric.breakdown.traces.rows;
      existing.ingestion.metrics.bytes += metric.breakdown.metrics.bytes;
      existing.ingestion.metrics.rows += metric.breakdown.metrics.rows;
      existing.ingestion.sessions.bytes += metric.breakdown.sessions.bytes;
      existing.ingestion.sessions.rows += metric.breakdown.sessions.rows;
    } else {
      serviceMap.set(metric.serviceName, {
        serviceName: metric.serviceName,
        ingestion: { ...metric.breakdown },
        costs: calculateCosts(metric.breakdown, pricing),
        estimatedHourlyCost: 0, // Will calculate below
      });
    }
  }

  // Recalculate costs and hourly estimates for each service
  const result: ServiceBilling[] = [];
  for (const service of serviceMap.values()) {
    service.costs = calculateCosts(service.ingestion, pricing);

    // Calculate estimated hourly cost from current ingestion
    // This is an approximation based on the time range used
    const hourlyBreakdown: IngestionBreakdown = {
      logs: {
        bytes: service.ingestion.logs.bytes,
        rows: service.ingestion.logs.rows,
      },
      traces: {
        bytes: service.ingestion.traces.bytes,
        rows: service.ingestion.traces.rows,
      },
      metrics: {
        bytes: service.ingestion.metrics.bytes,
        rows: service.ingestion.metrics.rows,
      },
      sessions: {
        bytes: service.ingestion.sessions.bytes,
        rows: service.ingestion.sessions.rows,
      },
    };
    service.estimatedHourlyCost = calculateCosts(hourlyBreakdown, pricing).total;

    result.push(service);
  }

  // Sort by total cost descending
  return result.sort((a, b) => b.costs.total - a.costs.total);
}

