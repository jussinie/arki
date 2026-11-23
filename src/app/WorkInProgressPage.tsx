import './WorkInProgressPage.css';

type WorkInProgressPageProps = {
  title: string;
};

export function WorkInProgressPage({ title }: WorkInProgressPageProps) {
  return (
    <main className="work-in-progress">
      <h2>{title}</h2>
      <p>Work in progress</p>
    </main>
  );
}
