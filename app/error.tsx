"use client";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="error-screen">
      <h1>便签架暂时打了个结</h1>
      <p>请重新加载后再试。</p>
      <button className="button primary" onClick={reset}>
        重新加载
      </button>
    </main>
  );
}
