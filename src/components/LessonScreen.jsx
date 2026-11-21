export default function LessonScreen({ chapter }) {
  return (
    <div className="flex flex-col gap-8">
      {chapter.lessons.map((lesson) => (
        <section key={lesson.id} className="flex flex-col gap-4">
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
      ))}
    </div>
  );
}
