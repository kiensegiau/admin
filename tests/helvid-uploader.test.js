const fetch = require('node-fetch');

async function testHelvidUploader() {
  try {
    console.log('Starting Helvid uploader test...');
    
    const response = await fetch('http://localhost:3000/api/helvid-uploader', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        driveUrl: 'https://drive.google.com/file/d/1dLVDDAarAJNPcAuZ6vP_B6h7rGu3bMxq/view?usp=sharing'
      }),
    });

    const data = await response.json();
    
    console.log('Response:', data);
    
    if (data.success) {
      console.log('Test passed! Upload successful');
      console.log('Upload key:', data.data.uploadKey);
      console.log('Upload response:', data.data.uploadResponse);
      console.log('Status:', data.data.status);
    } else {
      console.log('Test failed:', data.error);
    }
  } catch (error) {
    console.error('Test error:', error);
  }
}

// Run test
testHelvidUploader(); 