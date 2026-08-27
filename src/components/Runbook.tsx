import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';

export default function Runbook() {
  const [content, setContent] = useState('Carregando...');

  useEffect(() => {
    window.drPanel.runbook.read().then(setContent);
  }, []);

  return (
    <div>
      <h2>Runbook de Disaster Recovery</h2>
      <div className="card markdown-body">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    </div>
  );
}
