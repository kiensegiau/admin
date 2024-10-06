import { useState, useEffect } from 'react';
import B2 from 'backblaze-b2';

const useB2Auth = () => {
  const [b2, setB2] = useState(null);

  useEffect(() => {
    const initB2 = async () => {
      try {
        const response = await fetch('/api/b2-authorize');
        if (!response.ok) {
          throw new Error('Không thể xác thực B2');
        }
        const b2Instance = new B2({
          applicationKeyId: process.env.NEXT_PUBLIC_B2_APPLICATION_KEY_ID,
          applicationKey: process.env.NEXT_PUBLIC_B2_APPLICATION_KEY,
        });
        setB2(b2Instance);
      } catch (error) {
        console.error('Lỗi khi khởi tạo B2:', error);
      }
    };
    initB2();
  }, []);

  return b2;
};

export default useB2Auth;