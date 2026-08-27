import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';

export default function MarkdownDoc({ title, file }: { title: string; file: string }) {
  const [content, setContent] = useState('Carregando...');

  useEffect(() => {
    setContent('Carregando...');
    window.drPanel.docs.read(file).then(setContent);
  }, [file]);

  return (
    <div>
      <h2>{title}</h2>
      <div className="card markdown-body">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    </div>
  );
}
