import { db } from '../app/firebase';
import { doc, setDoc, increment, serverTimestamp } from 'firebase/firestore';

class Analytics {
  constructor() {
    this.db = db;
  }

  async trackVideoView(videoId, userId = 'anonymous') {
    try {
      const viewRef = doc(db, 'video_views', `${videoId}_${Date.now()}`);
      await setDoc(viewRef, {
        videoId,
        userId,
        timestamp: serverTimestamp()
      });

      // Update tổng số view
      const statsRef = doc(db, 'video_stats', videoId);
      await setDoc(statsRef, {
        totalViews: increment(1),
        lastViewed: serverTimestamp()
      }, { merge: true });

    } catch (error) {
      console.error('Error tracking video view:', error);
    }
  }
}

export const analytics = new Analytics(); 