import AutoScaling from './auto-scaling';
import BackupService from './backup-service';

export async function startServices() {
  // Khởi tạo services
  const scaling = new AutoScaling();
  const backup = new BackupService();

  // Start auto-scaling monitor
  scaling.monitor().catch(console.error);

  // Start backup schedule
  backup.startBackupSchedule().catch(console.error);

  console.log('Services started successfully');
} 