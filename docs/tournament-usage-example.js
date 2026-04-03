import {
  BRACKET_SIZE,
  createTournament,
  getRoundTitle,
  normalizeTournament,
  updateMatchWinner,
} from '../app/shared/tournament.js';

const participants = [
  { pseudo: 'Alice', character: 'Mage', image: '' },
  { pseudo: 'Bob', character: 'Knight', image: '' },
  { pseudo: 'Charly', character: 'Rogue', image: '' },
  { pseudo: 'Dina', character: 'Monk', image: '' },
  { pseudo: 'Eli', character: 'Archer', image: '' },
];

// 1) Génération du tournoi (mélange activé par défaut)
let tournament = createTournament(participants, BRACKET_SIZE);

// 2) Exemple de sélection du gagnant d'un match
// (ici quart #1 => propagation auto vers la demie)
tournament = updateMatchWinner(tournament, 0, 0, 'left');

// 3) Changement d'avis : on sélectionne l'autre côté
// => tous les tours suivants sont reconstruits proprement
tournament = updateMatchWinner(tournament, 0, 0, 'right');

// 4) Sauvegarde / restauration
const restored = normalizeTournament(tournament);

// 5) Titre des rounds
const labels = restored.rounds.map((_, i) => getRoundTitle(i, restored.rounds.length));
console.log(labels);
console.log('Champion:', restored.champion?.pseudo || 'Non défini');
