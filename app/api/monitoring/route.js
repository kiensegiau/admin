import MonitoringDashboard from '@/lib/monitoring-dashboard';

const dashboard = new MonitoringDashboard();

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const timeRange = searchParams.get('timeRange') || '24h';

  try {
    const report = await dashboard.generateReport(timeRange);
    
    return new Response(JSON.stringify(report), {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Monitoring error:', error);
    return new Response('Error generating report', { status: 500 });
  }
} 