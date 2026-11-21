import { useEffect } from 'react';
import { markLessonViewed } from '../lib/db.js';

// Records that this lesson was viewed, so progress can count completed lessons
function LessonSection({ lesson, profileId }) {
  useEffect(() => {
    markLessonViewed(profileId, lesson.id);
  }, [profileId, lesson.id]);

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-2xl font-bold">{lesson.title}</h2>
      <p className="text-xl leading-relaxed">{lesson.explanation}</p>

      {lesson.examples.map((ex, i) => (
        <div key={i} className="bg-white rounded-xl p-4 border flex flex-col gap-2">
          <span className="text-base text-violet-700 font-semibold">ఉదాహరణ</span>
          <p className="text-xl">{ex.problem}</p>
          <p className="text-lg text-gray-700">{ex.solution}</p>
        </div>
      ))}
    </section>
  );
}

export default function LessonScreen({ chapter, profileId }) {
  return (
    <div className="flex flex-col gap-8">
      {chapter.lessons.map((lesson) => (
        <LessonSection key={lesson.id} lesson={lesson} profileId={profileId} />
      ))}
    </div>
  );
}
