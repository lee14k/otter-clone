import { useParams } from "react-router-dom";

export default function LectureViewPage() {
  const { id } = useParams<{ id: string }>();
  return <h2 className="text-xl font-semibold">Lecture {id}</h2>;
}
