"use client";

import { useState } from "react";
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  CircularProgress,
  Alert,
  Snackbar,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";

export default function ImportCourseFromDrive() {
  const [folderUrl, setFolderUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [logs, setLogs] = useState([]);
  const [uploadResults, setUploadResults] = useState([]);
  const [openSnackbar, setOpenSnackbar] = useState(false);

  const columns = [
    { field: "fileName", headerName: "Tên File", flex: 2 },
    { field: "driveId", headerName: "ID Drive", flex: 2 },
    { field: "status", headerName: "Trạng thái", flex: 1 },
    {
      field: "helvidUrl",
      headerName: "URL Helvid",
      flex: 2,
      renderCell: (params) => {
        if (params.value) {
          return (
            <a href={params.value} target="_blank" rel="noopener noreferrer">
              {params.value}
            </a>
          );
        }
        return "";
      },
    },
  ];

  const addLog = (message) => {
    setLogs((prevLogs) => [...prevLogs, { id: Date.now(), message }]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!folderUrl.trim()) {
      setError("Vui lòng nhập URL folder Google Drive");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");
    setLogs([]);
    setUploadResults([]);

    addLog(`Bắt đầu xử lý folder: ${folderUrl}`);

    try {
      const response = await fetch("/api/import-helvid-from-drive", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ folderUrl }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Có lỗi xảy ra khi xử lý folder");
      }

      setUploadResults(
        data.results.map((item, index) => ({
          id: index,
          fileName: item.fileName || "Không xác định",
          driveId: item.driveId || "Không xác định",
          status: item.success ? "Thành công" : "Thất bại",
          helvidUrl: item.videoUrl || "",
          error: item.error || "",
        }))
      );

      setSuccess(`Đã xử lý ${data.results.length} file trong folder`);
      addLog(`Hoàn thành xử lý: ${data.results.length} file`);
      setOpenSnackbar(true);
    } catch (err) {
      setError(err.message || "Có lỗi xảy ra");
      addLog(`Lỗi: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCloseSnackbar = (event, reason) => {
    if (reason === "clickaway") {
      return;
    }
    setOpenSnackbar(false);
  };

  return (
    <Box sx={{ maxWidth: 1200, margin: "0 auto", padding: 3 }}>
      <Typography variant="h4" gutterBottom>
        Import Khóa Học từ Google Drive lên Helvid
      </Typography>

      <Paper elevation={3} sx={{ padding: 3, mb: 3 }}>
        <Box component="form" onSubmit={handleSubmit} noValidate>
          <TextField
            fullWidth
            margin="normal"
            label="URL Folder Google Drive"
            value={folderUrl}
            onChange={(e) => setFolderUrl(e.target.value)}
            disabled={loading}
            placeholder="https://drive.google.com/drive/folders/your-folder-id"
          />

          <Button
            type="submit"
            variant="contained"
            color="primary"
            disabled={loading}
            sx={{ mt: 2 }}
          >
            {loading ? <CircularProgress size={24} /> : "Bắt đầu Import"}
          </Button>
        </Box>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {logs.length > 0 && (
        <Paper elevation={3} sx={{ padding: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Logs:
          </Typography>
          <Box
            sx={{ maxHeight: 200, overflow: "auto", bgcolor: "#f5f5f5", p: 2 }}
          >
            {logs.map((log) => (
              <Typography
                key={log.id}
                variant="body2"
                sx={{ fontFamily: "monospace" }}
              >
                {new Date(log.id).toLocaleTimeString()}: {log.message}
              </Typography>
            ))}
          </Box>
        </Paper>
      )}

      {uploadResults.length > 0 && (
        <Paper elevation={3} sx={{ padding: 3 }}>
          <Typography variant="h6" gutterBottom>
            Kết quả Upload:
          </Typography>
          <Box sx={{ height: 400, width: "100%" }}>
            <DataGrid
              rows={uploadResults}
              columns={columns}
              pageSize={5}
              rowsPerPageOptions={[5, 10, 20]}
              disableSelectionOnClick
              sx={{
                "& .MuiDataGrid-row:nth-of-type(odd)": {
                  backgroundColor: "#f5f5f5",
                },
              }}
            />
          </Box>
        </Paper>
      )}

      <Snackbar
        open={openSnackbar}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
      >
        <Alert
          onClose={handleCloseSnackbar}
          severity="success"
          sx={{ width: "100%" }}
        >
          {success}
        </Alert>
      </Snackbar>
    </Box>
  );
}
