import React from 'react';
import { canPlayMatch, computeWinner, getRoundTitle } from '../app/shared/tournament.js';

/**
 * Exemple d'affichage propre :
 * - 1 colonne par round
 * - Les matchs sont groupés par round
 * - Le titre est calculé round par round
 */
export function TournamentBracket({ tournament, onSelectWinner }) {
  if (!tournament?.rounds?.length) {
    return <p>Aucun tournoi généré.</p>;
  }

  const totalRounds = tournament.rounds.length;

  return (
    <div className="bracket-grid">
      {tournament.rounds.map((round, roundIndex) => (
        <section key={roundIndex} className="round-column">
          <h3>{getRoundTitle(roundIndex, totalRounds)}</h3>

          {round.map((match, matchIndex) => {
            const winner = computeWinner(match, roundIndex);
            const playable = canPlayMatch(match, roundIndex);

            return (
              <article key={`${roundIndex}-${matchIndex}`} className="match-card">
                <button
                  type="button"
                  disabled={!playable || !match.left}
                  onClick={() => onSelectWinner(roundIndex, matchIndex, 'left')}
                  className={winner.side === 'left' ? 'winner' : ''}
                >
                  {match.left?.pseudo || 'En attente'}
                </button>

                <button
                  type="button"
                  disabled={!playable || !match.right}
                  onClick={() => onSelectWinner(roundIndex, matchIndex, 'right')}
                  className={winner.side === 'right' ? 'winner' : ''}
                >
                  {match.right?.pseudo || 'En attente'}
                </button>

                <span>{playable ? 'Duel' : 'Pas prêt'}</span>
              </article>
            );
          })}
        </section>
      ))}
    </div>
  );
}
