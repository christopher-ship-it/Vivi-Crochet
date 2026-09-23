import type { LegalDocument } from '../legal/documents';

export function LegalDocumentView({ document }: { document: LegalDocument }) {
  return (
    <article className="legal-doc">
      <p className="legal-doc__eyebrow">VIVI CROCHET</p>
      <h1 className="legal-doc__title">{document.title}</h1>
      <p className="legal-doc__effective">Effective Date: {document.effectiveDate}</p>

      {document.blocks.map((block, index) => {
        const key = `${block.type}-${index}`;
        switch (block.type) {
          case 'lead':
            return (
              <p key={key} className="legal-doc__paragraph legal-doc__paragraph--lead">
                {block.text}
              </p>
            );
          case 'paragraph':
            return (
              <p key={key} className="legal-doc__paragraph">
                {block.text}
              </p>
            );
          case 'heading':
            return (
              <h2 key={key} className="legal-doc__heading">
                {block.text}
              </h2>
            );
          case 'subheading':
            return (
              <h3 key={key} className="legal-doc__subheading">
                {block.text}
              </h3>
            );
          case 'bullets':
            return (
              <ul key={key} className="legal-doc__bullets">
                {block.items.map((item, itemIndex) => (
                  <li key={`${key}-${itemIndex}`}>{item}</li>
                ))}
              </ul>
            );
          default:
            return null;
        }
      })}
    </article>
  );
}
