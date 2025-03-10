# Trang test Upload Wasabi

## Cài đặt CORS để cho phép upload từ browser

Để upload file trực tiếp từ browser lên Wasabi S3 bằng phương thức Signed URL, bạn cần cấu hình CORS (Cross-Origin Resource Sharing) cho bucket.

### Bước 1: Lưu file cors.json

File `cors.json` đã được tạo trong thư mục này.

### Bước 2: Cài đặt AWS CLI

Nếu bạn chưa cài đặt AWS CLI, bạn có thể tải và cài đặt từ:
https://aws.amazon.com/cli/

### Bước 3: Cấu hình AWS CLI cho Wasabi

Chạy lệnh sau để cấu hình AWS CLI:

```bash
aws configure --profile wasabi
```

Nhập các thông tin sau:

- AWS Access Key ID: [Wasabi Access Key ID của bạn]
- AWS Secret Access Key: [Wasabi Secret Access Key của bạn]
- Default region name: ap-southeast-1
- Default output format: json

### Bước 4: Thiết lập CORS cho bucket

Chạy lệnh sau để thiết lập CORS cho bucket:

```bash
aws s3api put-bucket-cors --bucket hocmai --cors-configuration file://app/wasabi-test/cors.json --endpoint-url=https://s3.ap-southeast-1.wasabisys.com --profile wasabi
```

### Bước 5: Kiểm tra cấu hình CORS

Để kiểm tra cấu hình CORS đã được thiết lập chưa, chạy lệnh:

```bash
aws s3api get-bucket-cors --bucket hocmai --endpoint-url=https://s3.ap-southeast-1.wasabisys.com --profile wasabi
```

## Sử dụng trang test

1. Truy cập vào đường dẫn: `/wasabi-test`
2. Chọn phương thức upload:
   - Signed URL: Upload trực tiếp từ browser lên Wasabi (yêu cầu cấu hình CORS)
   - Direct Upload: Upload thông qua server
3. Chọn file cần upload và nhấn nút Upload
4. Danh sách file đã upload sẽ hiển thị bên dưới, bạn có thể xem hoặc xóa các file này

## Xử lý lỗi

Nếu bạn gặp lỗi CORS khi upload bằng phương thức Signed URL, hãy kiểm tra:

1. CORS đã được cấu hình đúng chưa
2. Endpoint URL phải chính xác với region của bucket
3. Trình duyệt có hỗ trợ các header cần thiết không
