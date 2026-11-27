import { createContext } from 'react';

/**
 * True where the board draws standing figures (the Christmas polar bear) in their own layer above
 * trains and pieces (TileFigure); tiles then leave them out. Elsewhere tiles draw their own.
 */
export const FiguresApart = createContext(false);
