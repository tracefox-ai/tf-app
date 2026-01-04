import express from 'express';
import { serializeError } from 'serialize-error';

import { getUserMemberships } from '@/controllers/teamMembership';
import Connection from '@/models/connection';
import DataIngestionMetrics from '@/models/dataIngestionMetrics';
import { Source } from '@/models/source';
import { queryServiceLevelMetrics } from '@/tasks/calculateDataIngestion/serviceMetrics';
import logger from '@/utils/logger';
import {
  calculateCosts,
  calculateForecasts,
  aggregateBillingByPeriod,
  getServiceLevelBilling,
  DEFAULT_PRICING,
  type IngestionBreakdown,
  type BillingData,
} from '@/utils/billing';

const router = express.Router();

/**
 * Get all teams the user owns
 */
async function getOwnedTeams(userId: string) {
  const memberships = await getUserMemberships(userId);
  return memberships
    .filter(m => m.role === 'owner' && m.status === 'active')
    .map(m => ({
      teamId: m.team._id || m.team,
      teamName: (m.team as any)?.name || 'Unknown Team',
    }));
}

/**
 * Get billing data for a specific team
 */
async function getTeamBillingData(
  teamId: string,
  startDate: string,
  endDate: string,
) {
  const metrics = await DataIngestionMetrics.find({
    team: teamId,
    date: {
      $gte: startDate,
      $lte: endDate,
    },
  })
    .sort({ date: 1, hour: 1 })
    .lean();

  // Aggregate daily billing
  const dailyBilling = new Map<string, BillingData>();

  for (const metric of metrics) {
    const date = metric.date;
    if (!dailyBilling.has(date)) {
      dailyBilling.set(date, {
        date,
        ingestion: {
          logs: { bytes: 0, rows: 0 },
          traces: { bytes: 0, rows: 0 },
          metrics: { bytes: 0, rows: 0 },
          sessions: { bytes: 0, rows: 0 },
        },
        costs: {
          logs: 0,
          traces: 0,
          metrics: 0,
          sessions: 0,
          total: 0,
        },
      });
    }

    const daily = dailyBilling.get(date)!;
    daily.ingestion.logs.bytes += metric.breakdown.logs.bytes;
    daily.ingestion.logs.rows += metric.breakdown.logs.rows;
    daily.ingestion.traces.bytes += metric.breakdown.traces.bytes;
    daily.ingestion.traces.rows += metric.breakdown.traces.rows;
    daily.ingestion.metrics.bytes += metric.breakdown.metrics.bytes;
    daily.ingestion.metrics.rows += metric.breakdown.metrics.rows;
    daily.ingestion.sessions.bytes += metric.breakdown.sessions.bytes;
    daily.ingestion.sessions.rows += metric.breakdown.sessions.rows;
  }

  // Calculate costs for each day
  const dailyBreakdown = Array.from(dailyBilling.values()).map(day => {
    day.costs = calculateCosts(day.ingestion, DEFAULT_PRICING);
    return day;
  });

  return {
    daily: dailyBreakdown,
    total: aggregateBillingByPeriod(dailyBreakdown),
  };
}

/**
 * Get current billing for a team
 */
async function getTeamCurrentBilling(teamId: string) {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const currentHour = today.getUTCHours();

  // Get today's metrics
  const todayMetrics = await DataIngestionMetrics.find({
    team: teamId,
    date: todayStr,
  })
    .sort({ hour: 1 })
    .lean();

  // Aggregate today's ingestion
  const todayBreakdown: IngestionBreakdown = {
    logs: { bytes: 0, rows: 0 },
    traces: { bytes: 0, rows: 0 },
    metrics: { bytes: 0, rows: 0 },
    sessions: { bytes: 0, rows: 0 },
  };

  for (const metric of todayMetrics) {
    todayBreakdown.logs.bytes += metric.breakdown.logs.bytes;
    todayBreakdown.logs.rows += metric.breakdown.logs.rows;
    todayBreakdown.traces.bytes += metric.breakdown.traces.bytes;
    todayBreakdown.traces.rows += metric.breakdown.traces.rows;
    todayBreakdown.metrics.bytes += metric.breakdown.metrics.bytes;
    todayBreakdown.metrics.rows += metric.breakdown.metrics.rows;
    todayBreakdown.sessions.bytes += metric.breakdown.sessions.bytes;
    todayBreakdown.sessions.rows += metric.breakdown.sessions.rows;
  }

  // Calculate today's costs
  const todayCosts = calculateCosts(todayBreakdown, DEFAULT_PRICING);

  // Calculate current hourly rate
  let currentHourlyCost = 0;
  const currentHourMetric = todayMetrics.find(m => m.hour === currentHour);
  const lastHourMetric =
    todayMetrics.length > 0 ? todayMetrics[todayMetrics.length - 1] : null;

  if (currentHourMetric) {
    const hourlyBreakdown: IngestionBreakdown = {
      logs: currentHourMetric.breakdown.logs,
      traces: currentHourMetric.breakdown.traces,
      metrics: currentHourMetric.breakdown.metrics,
      sessions: currentHourMetric.breakdown.sessions,
    };
    currentHourlyCost = calculateCosts(hourlyBreakdown, DEFAULT_PRICING).total;
  } else if (lastHourMetric) {
    const hourlyBreakdown: IngestionBreakdown = {
      logs: lastHourMetric.breakdown.logs,
      traces: lastHourMetric.breakdown.traces,
      metrics: lastHourMetric.breakdown.metrics,
      sessions: lastHourMetric.breakdown.sessions,
    };
    currentHourlyCost = calculateCosts(hourlyBreakdown, DEFAULT_PRICING).total;
  }

  const estimatedDailyCost = currentHourlyCost * 24;

  return {
    date: todayStr,
    ingestion: todayBreakdown,
    costs: todayCosts,
    currentHourlyCost: Math.round(currentHourlyCost * 100) / 100,
    estimatedDailyCost: Math.round(estimatedDailyCost * 100) / 100,
  };
}

/**
 * Get forecast for a team
 */
async function getTeamForecast(teamId: string) {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const currentHour = today.getUTCHours();

  // Get current hour cost
  const currentHourMetric = await DataIngestionMetrics.findOne({
    team: teamId,
    date: todayStr,
    hour: currentHour,
  }).lean();

  let currentHourlyCost = 0;
  if (currentHourMetric) {
    const hourlyBreakdown: IngestionBreakdown = {
      logs: currentHourMetric.breakdown.logs,
      traces: currentHourMetric.breakdown.traces,
      metrics: currentHourMetric.breakdown.metrics,
      sessions: currentHourMetric.breakdown.sessions,
    };
    currentHourlyCost = calculateCosts(hourlyBreakdown, DEFAULT_PRICING).total;
  }

  // Get last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const metrics = await DataIngestionMetrics.find({
    team: teamId,
    date: {
      $gte: thirtyDaysAgo.toISOString().split('T')[0],
      $lte: todayStr,
    },
  })
    .sort({ date: 1, hour: 1 })
    .lean();

  // Aggregate daily costs
  const dailyCostsMap = new Map<string, number>();
  for (const metric of metrics) {
    const date = metric.date;
    if (!dailyCostsMap.has(date)) {
      dailyCostsMap.set(date, 0);
    }

    const dailyBreakdown: IngestionBreakdown = {
      logs: metric.breakdown.logs,
      traces: metric.breakdown.traces,
      metrics: metric.breakdown.metrics,
      sessions: metric.breakdown.sessions,
    };
    const dailyCost = calculateCosts(dailyBreakdown, DEFAULT_PRICING).total;
    dailyCostsMap.set(date, dailyCostsMap.get(date)! + dailyCost);
  }

  const dailyCosts = Array.from(dailyCostsMap.values());
  const forecasts = calculateForecasts(currentHourlyCost, dailyCosts);

  return {
    forecasts,
    currentHourlyCost: Math.round(currentHourlyCost * 100) / 100,
    historicalDailyCosts: dailyCosts,
  };
}

// GET /api/billing - Get billing for all owned teams
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      throw new Error('User not authenticated');
    }

    const { startDate, endDate } = req.query;

    // Default to last 30 days
    const end = endDate
      ? new Date(endDate as string)
      : new Date();
    const start = startDate
      ? new Date(startDate as string)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];

    // Get all teams the user owns
    const ownedTeams = await getOwnedTeams(userId.toString());

    if (ownedTeams.length === 0) {
      return res.json({
        teams: [],
        total: {
          ingestion: {
            logs: { bytes: 0, rows: 0 },
            traces: { bytes: 0, rows: 0 },
            metrics: { bytes: 0, rows: 0 },
            sessions: { bytes: 0, rows: 0 },
          },
          costs: {
            logs: 0,
            traces: 0,
            metrics: 0,
            sessions: 0,
            total: 0,
          },
        },
      });
    }

    // Get billing for each team
    const teamBillings = await Promise.all(
      ownedTeams.map(async team => {
        const billing = await getTeamBillingData(
          team.teamId.toString(),
          startStr,
          endStr,
        );
        return {
          teamId: team.teamId.toString(),
          teamName: team.teamName,
          ...billing,
        };
      }),
    );

    // Calculate total across all teams
    const allDailyBilling: BillingData[] = [];
    for (const teamBilling of teamBillings) {
      allDailyBilling.push(...teamBilling.daily);
    }
    const totalBilling = aggregateBillingByPeriod(allDailyBilling);

    return res.json({
      teams: teamBillings,
      total: totalBilling,
      period: {
        start: startStr,
        end: endStr,
      },
    });
  } catch (e) {
    logger.error(
      {
        err: serializeError(e),
        userId: req.user?._id?.toString(),
      },
      'Error in billing endpoint',
    );
    next(e);
  }
});

// GET /api/billing/current - Get current billing for all owned teams
router.get('/current', async (req, res, next) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      throw new Error('User not authenticated');
    }

    const ownedTeams = await getOwnedTeams(userId.toString());

    if (ownedTeams.length === 0) {
      return res.json({
        teams: [],
        total: {
          ingestion: {
            logs: { bytes: 0, rows: 0 },
            traces: { bytes: 0, rows: 0 },
            metrics: { bytes: 0, rows: 0 },
            sessions: { bytes: 0, rows: 0 },
          },
          costs: {
            logs: 0,
            traces: 0,
            metrics: 0,
            sessions: 0,
            total: 0,
          },
          currentHourlyCost: 0,
          estimatedDailyCost: 0,
        },
      });
    }

    // Get current billing for each team
    const teamBillings = await Promise.all(
      ownedTeams.map(async team => {
        const current = await getTeamCurrentBilling(team.teamId.toString());
        return {
          teamId: team.teamId.toString(),
          teamName: team.teamName,
          ...current,
        };
      }),
    );

    // Calculate totals
    const totalIngestion: IngestionBreakdown = {
      logs: { bytes: 0, rows: 0 },
      traces: { bytes: 0, rows: 0 },
      metrics: { bytes: 0, rows: 0 },
      sessions: { bytes: 0, rows: 0 },
    };

    let totalCurrentHourlyCost = 0;

    for (const teamBilling of teamBillings) {
      totalIngestion.logs.bytes += teamBilling.ingestion.logs.bytes;
      totalIngestion.logs.rows += teamBilling.ingestion.logs.rows;
      totalIngestion.traces.bytes += teamBilling.ingestion.traces.bytes;
      totalIngestion.traces.rows += teamBilling.ingestion.traces.rows;
      totalIngestion.metrics.bytes += teamBilling.ingestion.metrics.bytes;
      totalIngestion.metrics.rows += teamBilling.ingestion.metrics.rows;
      totalIngestion.sessions.bytes += teamBilling.ingestion.sessions.bytes;
      totalIngestion.sessions.rows += teamBilling.ingestion.sessions.rows;
      totalCurrentHourlyCost += teamBilling.currentHourlyCost;
    }

    const totalCosts = calculateCosts(totalIngestion, DEFAULT_PRICING);
    const totalEstimatedDailyCost = totalCurrentHourlyCost * 24;

    return res.json({
      teams: teamBillings,
      total: {
        ingestion: totalIngestion,
        costs: totalCosts,
        currentHourlyCost: Math.round(totalCurrentHourlyCost * 100) / 100,
        estimatedDailyCost: Math.round(totalEstimatedDailyCost * 100) / 100,
      },
    });
  } catch (e) {
    logger.error(
      {
        err: serializeError(e),
        userId: req.user?._id?.toString(),
      },
      'Error in billing/current endpoint',
    );
    next(e);
  }
});

// GET /api/billing/forecast - Get forecasts for all owned teams
router.get('/forecast', async (req, res, next) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      throw new Error('User not authenticated');
    }

    const ownedTeams = await getOwnedTeams(userId.toString());

    if (ownedTeams.length === 0) {
      return res.json({
        teams: [],
        total: {
          forecasts: [],
          currentHourlyCost: 0,
          historicalDailyCosts: [],
        },
      });
    }

    // Get forecasts for each team
    const teamForecasts = await Promise.all(
      ownedTeams.map(async team => {
        const forecast = await getTeamForecast(team.teamId.toString());
        return {
          teamId: team.teamId.toString(),
          teamName: team.teamName,
          ...forecast,
        };
      }),
    );

    // Aggregate total hourly cost
    const totalCurrentHourlyCost = teamForecasts.reduce(
      (sum, f) => sum + f.currentHourlyCost,
      0,
    );

    // Aggregate all historical daily costs
    const allHistoricalCosts: number[] = [];
    for (const forecast of teamForecasts) {
      allHistoricalCosts.push(...forecast.historicalDailyCosts);
    }

    // Calculate aggregate forecasts
    const totalForecasts = calculateForecasts(
      totalCurrentHourlyCost,
      allHistoricalCosts,
    );

    return res.json({
      teams: teamForecasts,
      total: {
        forecasts: totalForecasts,
        currentHourlyCost: Math.round(totalCurrentHourlyCost * 100) / 100,
        historicalDailyCosts: allHistoricalCosts,
      },
    });
  } catch (e) {
    logger.error(
      {
        err: serializeError(e),
        userId: req.user?._id?.toString(),
      },
      'Error in billing/forecast endpoint',
    );
    next(e);
  }
});

// GET /api/billing/export - Export billing data for all owned teams
router.get('/export', async (req, res, next) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      throw new Error('User not authenticated');
    }

    const { startDate, endDate, format } = req.query;
    const exportFormat = (format as string) || 'json';

    // Default to last 30 days
    const end = endDate
      ? new Date(endDate as string)
      : new Date();
    const start = startDate
      ? new Date(startDate as string)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];

    // Get all teams the user owns
    const ownedTeams = await getOwnedTeams(userId.toString());

    if (ownedTeams.length === 0) {
      return res.json({
        period: {
          start: startStr,
          end: endStr,
        },
        teams: [],
        total: {
          ingestion: {
            logs: { bytes: 0, rows: 0 },
            traces: { bytes: 0, rows: 0 },
            metrics: { bytes: 0, rows: 0 },
            sessions: { bytes: 0, rows: 0 },
          },
          costs: {
            logs: 0,
            traces: 0,
            metrics: 0,
            sessions: 0,
            total: 0,
          },
        },
      });
    }

    // Get billing for each team
    const teamBillings = await Promise.all(
      ownedTeams.map(async team => {
        const billing = await getTeamBillingData(
          team.teamId.toString(),
          startStr,
          endStr,
        );
        return {
          teamId: team.teamId.toString(),
          teamName: team.teamName,
          ...billing,
        };
      }),
    );

    // Calculate total across all teams
    const allDailyBilling: BillingData[] = [];
    for (const teamBilling of teamBillings) {
      allDailyBilling.push(...teamBilling.daily);
    }
    const totalBilling = aggregateBillingByPeriod(allDailyBilling);

    if (exportFormat === 'csv') {
      // Generate CSV
      const csvRows = [
        [
          'Team',
          'Date',
          'Logs Bytes',
          'Logs Rows',
          'Logs Cost ($)',
          'Traces Bytes',
          'Traces Rows',
          'Traces Cost ($)',
          'Metrics Bytes',
          'Metrics Rows',
          'Metrics Cost ($)',
          'Total Cost ($)',
        ].join(','),
      ];

      for (const teamBilling of teamBillings) {
        for (const day of teamBilling.daily) {
          csvRows.push(
            [
              teamBilling.teamName,
              day.date || '',
              day.ingestion.logs.bytes,
              day.ingestion.logs.rows,
              day.costs.logs,
              day.ingestion.traces.bytes,
              day.ingestion.traces.rows,
              day.costs.traces,
              day.ingestion.metrics.bytes,
              day.ingestion.metrics.rows,
              day.costs.metrics,
              day.costs.total,
            ].join(','),
          );
        }
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="billing-export-${startStr}-${endStr}.csv"`,
      );
      return res.send(csvRows.join('\n'));
    } else {
      // JSON format
      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="billing-export-${startStr}-${endStr}.json"`,
      );
      return res.json({
        period: {
          start: startStr,
          end: endStr,
        },
        teams: teamBillings,
        total: totalBilling,
      });
    }
  } catch (e) {
    logger.error(
      {
        err: serializeError(e),
        userId: req.user?._id?.toString(),
      },
      'Error in billing/export endpoint',
    );
    next(e);
  }
});

export default router;

