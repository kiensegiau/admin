import { NextResponse } from "next/server";
import { PassThrough } from "stream";
import { uploadToR2Direct } from "../../utils/r2DirectUpload";
import { uploadToDrive } from "../../utils/driveUpload";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";

function removeUndefined(obj) {
  Object.keys(obj).forEach(key => {
    if (obj[key] && typeof obj[key] === 'object') {
      removeUndefined(obj[key]);
    } else if (obj[key] === undefined) {
      delete obj[key];
    }
  });
  return obj;
}

export async function POST(req) {
  const stream = new PassThrough();
  const encoder = new TextEncoder();

  const sendUpdate = (message) => {
    stream.write(encoder.encode(`data: ${JSON.stringify(message)}\n\n`));
  };

  const response = new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });

  try {
    const formData = await req.formData();
    const {
      file,
      courseName,
      chapterName,
      lessonName,
      courseId,
      chapterId,
      lessonId,
    } = Object.fromEntries(formData);

    if (!file || !courseId || !chapterId || !lessonId) {
      return NextResponse.json(
        { error: "Thiếu các trường bắt buộc" },
        { status: 400 }
      );
    }

    sendUpdate({ step: "Đang tải lên Google Drive", progress: 0 });
    const accessToken = req.cookies.get("googleDriveAccessToken")?.value;
    if (!accessToken) {
      throw new Error("Không có access token cho Google Drive");
    }
    const drivePath = `khoa-hoc/${courseName}/${chapterName}/${lessonName}`;
    const driveResult = await uploadToDrive(
      file,
      accessToken,
      () => {},
      drivePath
    );
    sendUpdate({ step: "Đã tải lên Google Drive", progress: 40 });

    sendUpdate({ step: "Đang tải lên R2", progress: 40 });
    const { fileId: r2FileId, downloadUrl: r2Url } = await uploadToR2Direct(
      file,
      courseName,
      chapterName,
      lessonName
    );
    sendUpdate({ step: "Đã tải lên R2", progress: 80 });

    const fileData = {
      name: file.name,
      r2FileId: `/api/r2-proxy?key=${encodeURIComponent(r2FileId)}`,
      driveFileId: driveResult.fileId,
      driveUrl: driveResult.webViewLink,
      type: file.type,
      uploadTime: new Date().toISOString(),
    };

    sendUpdate({ step: "Đang cập nhật cơ sở dữ liệu", progress: 80 });
    const courseRef = doc(db, "courses", courseId);
    const courseDoc = await getDoc(courseRef);
    const courseData = courseDoc.data();

    if (!courseData) {
      throw new Error("Không tìm thấy dữ liệu khóa học");
    }

    const updatedChapters = courseData.chapters.map((chapter) => {
      if (chapter.id === chapterId) {
        return {
          ...chapter,
          lessons: chapter.lessons.map((lesson) => {
            if (lesson.id === lessonId) {
              return {
                ...lesson,
                files: [...(lesson.files || []), fileData],
              };
            }
            return lesson;
          }),
        };
      }
      return chapter;
    });

    if (JSON.stringify(updatedChapters) === JSON.stringify(courseData.chapters)) {
      throw new Error('Không tìm thấy chapter hoặc lesson để cập nhật');
    }

    const cleanedData = removeUndefined({ chapters: updatedChapters });
    await updateDoc(courseRef, cleanedData);
    sendUpdate({ step: "Hoàn thành", progress: 100 });

    stream.end();
    return response;
  } catch (error) {
    sendUpdate({ error: error.message });
    stream.end();
    return response;
  }
}
