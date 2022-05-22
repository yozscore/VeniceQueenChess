/* ================================================ *\
                    ~ Venice Queen ~
    A poorly made browser based chess application!
    I tried my best to keep the code in one file
    and it made my life miserable :)
    Current performance for just the Perft searches
    is 2-4M NPS. That's horrible but I don't think
    I'm going for much better than that at this
    point in time :(
    The bot uses minimax with alpha beta pruning 
    with quiescence and move sorting. I will not 
    be adding anything more than that at this point. 
    User interface is absolutely atrocious and
    looks ugly. No dragging and dropping and I am 
    sure there's some bugs with clicking squares. 
    I am too lazy to fix those.
\* ================================================ */

const KING = 0, QUEEN = 1, BISHOP = 2, KNIGHT = 3, ROOK = 4, PAWN = 5;      //0b0XXX
const WHITE = 0, BLACK = 8;         // 0bX000
const NO_PIECE = 31;                // 0b11111

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// Get piece color
function getPieceColor(piece) {
    return piece & 8;
}

// Get piece type
function getPieceType(piece) {
    return piece & 7;
}

const PIECE_STRING_LUT = ["K", "Q", "B", "N", "R", "P"];

const FILE_LUT = {
    "a": 0, "b": 1, "c": 2, "d": 3, "e": 4, "f": 5, "g": 6, "h": 7
};

const FILE_TO_STRING = {
    "0": "a", "1": "b", "2": "c", "3": "d", "4": "e", "5": "f", "6": "g", "7": "h"
};

const RANK_LUT = {
    "1": 0, "2": 1, "3": 2, "4": 3, "5": 4, "6": 5, "7": 6, "8": 7
}

const RANK_TO_STRING = {
    "0": "1", "1": "2", "2": "3", "3": "4", "4": "5", "5": "6", "6": "7", "7": "8"
};

const dfDiag = [ 1, 1, -1, -1 ], drDiag = [ 1, -1, 1, -1 ];
const dfStra = [ 1, 0, -1, 0 ], drStra = [ 0, 1, 0, -1 ];
const dfKnig = [ -2, -1, 1, 2, 2, 1, -1, -2 ], drKnig = [ 1, 2, 2, 1, -1, -2, -2, -1 ];

const ROOK_FILES = [
    { kingSide: 7, queenSide: 0 },      // 0
    {}, {}, {}, {}, {}, {}, {}, 
    { kingSide: 7, queenSide: 0 },      // 8
];

const CASTLING_DEST = [
    { kingSide: 6, queenSide: 2 },      // 0
    {}, {}, {}, {}, {}, {}, {}, 
    { kingSide: 6, queenSide: 2 },      // 8
];

// Get square from string
function parseSquare(square) {
    if(square.length !== 2) return undefined;
    else return {
        file: FILE_LUT[square.charAt(0)],
        rank: RANK_LUT[square.charAt(1)]
    }
}

// Get string from square
function getSquareString(square) {
    return FILE_TO_STRING[square.file] + RANK_TO_STRING[square.rank];
}

// Get castling rights as a string
function castlingRightsToString() {
    let res = "";
    if(castlingRights[WHITE].kingSide) res += "K";
    if(castlingRights[WHITE].queenSide) res += "Q";
    if(castlingRights[BLACK].kingSide) res += "k";
    if(castlingRights[BLACK].queenSide) res += "q";
    if(res === "") return "-";
    else return res;
}

// ----------------------------------- GAME LOGIC -----------------------------------------

var board = Array.from(Array(8), () => new Array(8));       // 8x8 matrix for chess board   [RANK, FILE]
var currentColor = WHITE;
var enPassantSquare = undefined;
var castlingRights = [
    {           // 0
        kingSide: true,
        queenSide: true
    }, {}, {}, {}, {}, {}, {}, {},
    {           // 8
        kingSide: true,
        queenSide: true
    }
];
var kingSquare = [
    undefined,     // 0
    undefined, undefined, undefined, undefined, undefined, undefined, undefined,
    undefined      // 8
];
var fullClock = 1, halfClock = 0;

// Load the position from the given FEN string
function loadFromFEN(fen) {
    let fenFragments = fen.split(/(\s+)/).filter( e => e.trim().length > 0)
    
    let boardComposition = fenFragments[0];
    for(let r = 0; r < 8; r++) for(let f = 0; f < 8; f++) board[r][f] = NO_PIECE;
    let rank = 7, file = 0;
    for(let i = 0; i < boardComposition.length; i++) {
        let c = boardComposition.charAt(i);
        if(!isNaN(c)) file += parseInt(c);
        else if(c === "/") {
            file = 0;
            rank--;
        }
        else {
            let side = c == c.toUpperCase() ? WHITE : BLACK;
            c = c.toUpperCase();
            let piece = -1;
            switch(c) {
                case "K": board[rank][file] = side | KING; kingSquare[side] = { file: file, rank: rank }; break;
                case "Q": board[rank][file] = side | QUEEN; break;
                case "B": board[rank][file] = side | BISHOP; break;
                case "N": board[rank][file] = side | KNIGHT; break;
                case "R": board[rank][file] = side | ROOK; break;
                case "P": board[rank][file] = side | PAWN; break;
            }
            file++;
        }
    }

    currentColor = fenFragments[1] === "w" ? WHITE : BLACK;

    let castlingString = fenFragments[2];
    castlingRights[WHITE].kingSide = castlingString.indexOf("K") !== -1 ? true : false;
    castlingRights[WHITE].queenSide = castlingString.indexOf("Q") !== -1 ? true : false;
    castlingRights[BLACK].kingSide = castlingString.indexOf("k") !== -1 ? true : false;
    castlingRights[BLACK].queenSide = castlingString.indexOf("q") !== -1 ? true : false;

    enPassantSquare = parseSquare(fenFragments[3]);
}

// Perform the given move on the board
function performMove(move) {
    let from = move.from;
    let to = move.to;
    let movedpiece = move.movedpiece;
    let takenpiece = move.takenpiece;
    let type = getPieceType(movedpiece);

    // Reset castling moves
    if(type === KING) {
        kingSquare[currentColor] = { file: to.file, rank: to.rank };
        castlingRights[currentColor].kingSide = false;
        castlingRights[currentColor].queenSide = false;
    }
    else if(type === ROOK) {
        let rank = currentColor === WHITE ? 0 : 7;
        if(castlingRights[currentColor].kingSide && from.rank == rank && from.file === ROOK_FILES[currentColor].kingSide) castlingRights[currentColor].kingSide = false;
        else if(castlingRights[currentColor].queenSide && from.rank == rank && from.file === ROOK_FILES[currentColor].queenSide) castlingRights[currentColor].queenSide = false;
    }

    enPassantSquare = undefined;
    if(takenpiece === NO_PIECE){
        if(move.doublepush) {
            if(currentColor === WHITE) enPassantSquare = { file: to.file, rank: to.rank - 1 };
            else enPassantSquare = { file: to.file, rank: to.rank + 1 };
        }
        else if(move.enpassant) {
            if(currentColor === WHITE) board[to.rank - 1][to.file] = NO_PIECE;
            else board[to.rank + 1][to.file] = NO_PIECE;
        }
        else if(move.castlingKS) {
            let rank = currentColor === WHITE ? 0 : 7;
            board[rank][ROOK_FILES[currentColor].kingSide] = NO_PIECE;
            board[rank][CASTLING_DEST[currentColor].kingSide - 1] = (currentColor | ROOK);
        }
        else if(move.castlingQS) {
            let rank = currentColor === WHITE ? 0 : 7;
            board[rank][ROOK_FILES[currentColor].queenSide] = NO_PIECE;
            board[rank][CASTLING_DEST[currentColor].queenSide + 1] = (currentColor | ROOK);
        }
    }
    // Capture
    else {
        if(getPieceType(takenpiece) === ROOK) {
            let opposite = currentColor ^ BLACK;
            let rank = currentColor === WHITE ? 7 : 0;
            if(castlingRights[opposite].kingSide && to.rank == rank && to.file === ROOK_FILES[opposite].kingSide) castlingRights[opposite].kingSide = false;
            else if(castlingRights[opposite].queenSide && to.rank == rank && to.file === ROOK_FILES[opposite].queenSide) castlingRights[opposite].queenSide = false;
        }
    }

    board[from.rank][from.file] = NO_PIECE;
    board[to.rank][to.file] = move.promotion === NO_PIECE ? movedpiece : (currentColor | move.promotion);

    currentColor ^= BLACK;
}

// Reverse the given move on the board
function unperformMove(move) {
    let from = move.from;
    let to = move.to;
    let movedpiece = move.movedpiece;
    let takenpiece = move.takenpiece;
    let type = getPieceType(movedpiece);
    let opposite = currentColor ^ BLACK;

    // Reset castling moves
    if(type === KING) kingSquare[opposite] = { file: from.file, rank: from.rank };
    if(takenpiece === NO_PIECE){
        if(move.enpassant) {
            if(opposite === WHITE) board[to.rank - 1][to.file] = (currentColor | PAWN);
            else board[to.rank + 1][to.file] = (currentColor | PAWN);
        }
        else if(move.castlingKS) {
            let rank = opposite === WHITE ? 0 : 7;
            board[rank][ROOK_FILES[opposite].kingSide] = (opposite | ROOK);
            board[rank][CASTLING_DEST[opposite].kingSide - 1] = NO_PIECE;
        }
        else if(move.castlingQS) {
            let rank = opposite === WHITE ? 0 : 7;
            board[rank][ROOK_FILES[opposite].queenSide] = (opposite | ROOK);
            board[rank][CASTLING_DEST[opposite].queenSide + 1] = NO_PIECE;
        }
    }
    
    enPassantSquare = move.enPassantSquareCopy;
    castlingRights = move.castlingRightsCopy;
    board[to.rank][to.file] = takenpiece === NO_PIECE ? NO_PIECE : takenpiece;
    board[from.rank][from.file] = movedpiece;

    currentColor = opposite;
}

// Check if the given square is attacked by any piece
function isSquareAttackedBySide(color, square) {
    let f = square.file, r = square.rank;
    // KINGS
    for(let dr = r - 1; dr <= r + 1; dr++) {
        for(let df = f - 1; df <= f + 1; df++) {
            if(df < 0 || df > 7 || dr < 0 || dr > 7 || (df === f && dr === r)) continue;
            if(board[dr][df] === (color | KING)) return true;
        }
    }
    // PAWNS
    if(color === WHITE && r > 0) {
        if((f < 7 && board[r - 1][f + 1] === (WHITE | PAWN)) || (f > 0 && board[r - 1][f - 1] === (WHITE | PAWN))) return true;
    }
    else if(color === BLACK && r < 7) {
        if((f < 7 && board[r + 1][f + 1] === (BLACK | PAWN)) || (f > 0 && board[r + 1][f - 1] === (BLACK | PAWN))) return true;
    }
    // KNIGHTS
    for(let dir = 0; dir < 8; dir++) {
        let dr = r + drKnig[dir], df = f + dfKnig[dir];
        if(dr < 0 || dr > 7 || df < 0 || df > 7) continue;
        if(board[dr][df] === (color | KNIGHT)) return true;
    }
    // BISHOP
    for(let dir = 0; dir < 4; dir++) {
        let dr = r + drDiag[dir], df = f + dfDiag[dir];
        while(df >= 0 && df <= 7 && dr >= 0 && dr <= 7) {
            if(board[dr][df] !== NO_PIECE) {
                if(board[dr][df] === (color | BISHOP) || board[dr][df] === (color | QUEEN)) return true;
                break;
            }
            dr += drDiag[dir]; df += dfDiag[dir];
        }
    }
    // ROOKS
    for(let dir = 0; dir < 4; dir++) {
        let dr = r + drStra[dir], df = f + dfStra[dir];
        while(df >= 0 && df <= 7 && dr >= 0 && dr <= 7) {
            if(board[dr][df] !== NO_PIECE) {
                if(board[dr][df] === (color | ROOK) || board[dr][df] === (color | QUEEN)) return true;
                break;
            }
            dr += drStra[dir]; df += dfStra[dir];
        }
    }
    return false;
}

// Generate moves
function generateMoves(captureOnly = false) {
    let moveList = [];
    function addMove(from, toFile, toRank, movedpiece, takenpiece, enpassant, kingSide, queenSide, doublepush, promotion) {
        moveList.push({
            from: from,
            to: {
                file: toFile, 
                rank: toRank
            },
            movedpiece: movedpiece,
            takenpiece: takenpiece,
            enpassant: enpassant,
            castlingKS: kingSide,
            castlingQS: queenSide,
            doublepush: doublepush,
            promotion: promotion,
            castlingRightsCopy: [
                {           // 0
                    kingSide: castlingRights[WHITE].kingSide,
                    queenSide: castlingRights[WHITE].queenSide
                }, {}, {}, {}, {}, {}, {}, {},
                {           // 8
                    kingSide: castlingRights[BLACK].kingSide,
                    queenSide: castlingRights[BLACK].queenSide
                }
            ],
            enPassantSquareCopy: enPassantSquare === undefined ? undefined : { file: enPassantSquare.file, rank: enPassantSquare.rank }
        });
    }

    let color = currentColor;
    let opposite = currentColor ^ BLACK;

    for(let r = 0; r < 8; r++) {
        for(let f = 0; f < 8; f++) {
            let piece = board[r][f];
            if(piece === NO_PIECE || getPieceColor(piece) !== color) continue;    // Skip 

            let type = getPieceType(piece);
            let from = {
                file: f,
                rank: r
            };

            if(type === KING) {
                for(let df = f - 1; df <= f + 1; df++) {
                    for(let dr = r - 1; dr <= r + 1; dr++) {
                        if(df < 0 || df > 7 || dr < 0 || dr > 7 || (df === f && dr === r)) continue;
                        if(board[dr][df] !== NO_PIECE && getPieceColor(board[dr][df]) === color) continue;
                        if(!captureOnly || board[dr][df] != NO_PIECE) addMove(from, df, dr, color | KING, board[dr][df], false, false, false, false, NO_PIECE);
                    }
                }

                // Castling moves
                if(!captureOnly && !isSquareAttackedBySide(opposite, kingSquare[color])) {
                    if(castlingRights[color].kingSide) {
                        let checkAttacks = true, castlingAllowed = true;
                        for(let df = kingSquare[color].file + 1; df < ROOK_FILES[color].kingSide; df++) {
                            if(checkAttacks && isSquareAttackedBySide(opposite, { file: df, rank: r })) {
                                castlingAllowed = false;
                                break;
                            }
                            if(df === CASTLING_DEST[color].kingSide) checkAttacks = false;
                            if(board[r][df] !== NO_PIECE) {
                                castlingAllowed = false;
                                break;
                            }
                        }
                        if(castlingAllowed) addMove(from, CASTLING_DEST[color].kingSide, r, color | KING, NO_PIECE, false, true, false, false, NO_PIECE);
                    }
                    if(castlingRights[color].queenSide) {
                        let checkAttacks = true, castlingAllowed = true;
                        for(let df = kingSquare[color].file - 1; df > ROOK_FILES[color].queenSide; df--) {
                            if(checkAttacks && isSquareAttackedBySide(opposite, { file: df, rank: r })) {
                                castlingAllowed = false;
                                break;
                            }
                            if(df === CASTLING_DEST[color].queenSide) checkAttacks = false;
                            if(board[r][df] !== NO_PIECE) {
                                castlingAllowed = false;
                                break;
                            }
                        }
                        if(castlingAllowed) addMove(from, CASTLING_DEST[color].queenSide, r, color | KING, NO_PIECE, false, false, true, false, NO_PIECE);
                    }
                }
            }
            else if(type === QUEEN) {
                for(let dir = 0; dir < 4; dir++) {
                    let dr = r + drDiag[dir], df = f + dfDiag[dir];
                    while(df >= 0 && df <= 7 && dr >= 0 && dr <= 7) {
                        if(board[dr][df] !== NO_PIECE) {
                            if(getPieceColor(board[dr][df]) === opposite) addMove(from, df, dr, color | QUEEN, board[dr][df], false, false, false, false, NO_PIECE);
                            break;
                        }
                        if(!captureOnly) addMove(from, df, dr, color | QUEEN, NO_PIECE, false, false, false, false, NO_PIECE);
                        dr += drDiag[dir]; df += dfDiag[dir];
                    }
                }
                for(let dir = 0; dir < 4; dir++) {
                    let dr = r + drStra[dir], df = f + dfStra[dir];
                    while(df >= 0 && df <= 7 && dr >= 0 && dr <= 7) {
                        if(board[dr][df] !== NO_PIECE) {
                            if(getPieceColor(board[dr][df]) === opposite) addMove(from, df, dr, color | QUEEN, board[dr][df], false, false, false, false, NO_PIECE);
                            break;
                        }
                        if(!captureOnly) addMove(from, df, dr, color | QUEEN, NO_PIECE, false, false, false, false, NO_PIECE);
                        dr += drStra[dir]; df += dfStra[dir];
                    }
                }
            }
            else if(type === BISHOP) {
                for(let dir = 0; dir < 4; dir++) {
                    let dr = r + drDiag[dir], df = f + dfDiag[dir];
                    while(df >= 0 && df <= 7 && dr >= 0 && dr <= 7) {
                        if(board[dr][df] !== NO_PIECE) {
                            if(getPieceColor(board[dr][df]) === opposite) addMove(from, df, dr, color | BISHOP, board[dr][df], false, false, false, false, NO_PIECE);
                            break;
                        }
                        if(!captureOnly) addMove(from, df, dr, color | BISHOP, NO_PIECE, false, false, false, false, NO_PIECE);
                        dr += drDiag[dir]; df += dfDiag[dir];
                    }
                }
            }
            else if(type === KNIGHT) {
                for(let dir = 0; dir < 8; dir++) {
                    let dr = r + drKnig[dir], df = f + dfKnig[dir];
                    if(dr < 0 || dr > 7 || df < 0 || df > 7) continue;
                    if(board[dr][df] === NO_PIECE || getPieceColor(board[dr][df]) === opposite) {
                        if(!captureOnly || board[dr][df] != NO_PIECE) addMove(from, df, dr, color | KNIGHT, board[dr][df], false, false, false, false, NO_PIECE);
                    }
                }
            }
            else if(type === ROOK) {
                for(let dir = 0; dir < 4; dir++) {
                    let dr = r + drStra[dir], df = f + dfStra[dir];
                    while(df >= 0 && df <= 7 && dr >= 0 && dr <= 7) {
                        if(board[dr][df] !== NO_PIECE) {
                            if(getPieceColor(board[dr][df]) === opposite) addMove(from, df, dr, color | ROOK, board[dr][df], false, false, false, false, NO_PIECE);
                            break;
                        }
                        if(!captureOnly) addMove(from, df, dr, color | ROOK, NO_PIECE, false, false, false, false, NO_PIECE);
                        dr += drStra[dir]; df += dfStra[dir];
                    }
                }
            }
            else if(type === PAWN) {
                if(color === WHITE) {
                    // Push
                    if(!captureOnly && board[r + 1][f] === NO_PIECE) {
                        if(r === 6) {
                            addMove(from, f, r + 1, WHITE | PAWN, NO_PIECE, false, false, false, false, QUEEN);
                            addMove(from, f, r + 1, WHITE | PAWN, NO_PIECE, false, false, false, false, BISHOP);
                            addMove(from, f, r + 1, WHITE | PAWN, NO_PIECE, false, false, false, false, KNIGHT);
                            addMove(from, f, r + 1, WHITE | PAWN, NO_PIECE, false, false, false, false, ROOK);
                        }
                        else {
                            addMove(from, f, r + 1, WHITE | PAWN, NO_PIECE, false, false, false, false, NO_PIECE);
                            if(r === 1 && board[r + 2][f] === NO_PIECE) addMove(from, f, r + 2, WHITE | PAWN, NO_PIECE, false, false, false, true, NO_PIECE);
                        }
                    }

                    // Attacks
                    if(f > 0 && board[r + 1][f - 1] !== NO_PIECE && getPieceColor(board[r + 1][f - 1]) === opposite) {
                        if(r === 6) {
                            addMove(from, f - 1, r + 1, WHITE | PAWN, board[r + 1][f - 1], false, false, false, false, QUEEN);
                            addMove(from, f - 1, r + 1, WHITE | PAWN, board[r + 1][f - 1], false, false, false, false, BISHOP);
                            addMove(from, f - 1, r + 1, WHITE | PAWN, board[r + 1][f - 1], false, false, false, false, KNIGHT);
                            addMove(from, f - 1, r + 1, WHITE | PAWN, board[r + 1][f - 1], false, false, false, false, ROOK);
                        }
                        else addMove(from, f - 1, r + 1, WHITE | PAWN, board[r + 1][f - 1], false, false, false, false, NO_PIECE);
                    }
                    if(f < 7 && board[r + 1][f + 1] !== NO_PIECE && getPieceColor(board[r + 1][f + 1]) === opposite) {
                        if(r === 6) {
                            addMove(from, f + 1, r + 1, WHITE | PAWN, board[r + 1][f + 1], false, false, false, false, QUEEN);
                            addMove(from, f + 1, r + 1, WHITE | PAWN, board[r + 1][f + 1], false, false, false, false, BISHOP);
                            addMove(from, f + 1, r + 1, WHITE | PAWN, board[r + 1][f + 1], false, false, false, false, KNIGHT);
                            addMove(from, f + 1, r + 1, WHITE | PAWN, board[r + 1][f + 1], false, false, false, false, ROOK);
                        }
                        else addMove(from, f + 1, r + 1, WHITE | PAWN, board[r + 1][f + 1], false, false, false, false, NO_PIECE);
                    }

                    // En passant capture
                    if(enPassantSquare !== undefined && r + 1 == enPassantSquare.rank && (f - 1 == enPassantSquare.file || f + 1 == enPassantSquare.file)) {
                        addMove(from, enPassantSquare.file, enPassantSquare.rank, WHITE | PAWN, NO_PIECE, true, false, false, false, NO_PIECE);
                    }
                }
                else {
                    // Push
                    if(!captureOnly && board[r - 1][f] === NO_PIECE) {
                        if(r === 1) {
                            addMove(from, f, r - 1, BLACK | PAWN, NO_PIECE, false, false, false, false, QUEEN);
                            addMove(from, f, r - 1, BLACK | PAWN, NO_PIECE, false, false, false, false, BISHOP);
                            addMove(from, f, r - 1, BLACK | PAWN, NO_PIECE, false, false, false, false, KNIGHT);
                            addMove(from, f, r - 1, BLACK | PAWN, NO_PIECE, false, false, false, false, ROOK);
                        }
                        else {
                            addMove(from, f, r - 1, BLACK | PAWN, NO_PIECE, false, false, false, false, NO_PIECE);
                            if(r === 6 && board[r - 2][f] === NO_PIECE) addMove(from, f, r - 2, BLACK | PAWN, NO_PIECE, false, false, false, true, NO_PIECE);
                        }
                    }

                    // Attacks
                    if(f > 0 && board[r - 1][f - 1] !== NO_PIECE && getPieceColor(board[r - 1][f - 1]) === opposite) {
                        if(r === 1) {
                            addMove(from, f - 1, r - 1, BLACK | PAWN, board[r - 1][f - 1], false, false, false, false, QUEEN);
                            addMove(from, f - 1, r - 1, BLACK | PAWN, board[r - 1][f - 1], false, false, false, false, BISHOP);
                            addMove(from, f - 1, r - 1, BLACK | PAWN, board[r - 1][f - 1], false, false, false, false, KNIGHT);
                            addMove(from, f - 1, r - 1, BLACK | PAWN, board[r - 1][f - 1], false, false, false, false, ROOK);
                        }
                        else addMove(from, f - 1, r - 1, BLACK | PAWN, board[r - 1][f - 1], false, false, false, false, NO_PIECE);
                    }
                    if(f < 7 && board[r - 1][f + 1] !== NO_PIECE && getPieceColor(board[r - 1][f + 1]) === opposite) {
                        if(r === 1) {
                            addMove(from, f + 1, r - 1, BLACK | PAWN, board[r - 1][f + 1], false, false, false, false, QUEEN);
                            addMove(from, f + 1, r - 1, BLACK | PAWN, board[r - 1][f + 1], false, false, false, false, BISHOP);
                            addMove(from, f + 1, r - 1, BLACK | PAWN, board[r - 1][f + 1], false, false, false, false, KNIGHT);
                            addMove(from, f + 1, r - 1, BLACK | PAWN, board[r - 1][f + 1], false, false, false, false, ROOK);
                        }
                        else addMove(from, f + 1, r - 1, BLACK | PAWN, board[r - 1][f + 1], false, false, false, false, NO_PIECE);
                    }

                    // En passant capture
                    if(enPassantSquare !== undefined && r - 1 == enPassantSquare.rank && (f - 1 == enPassantSquare.file || f + 1 == enPassantSquare.file)) {
                        addMove(from, enPassantSquare.file, enPassantSquare.rank, BLACK | PAWN, NO_PIECE, true, false, false, false, NO_PIECE);
                    }
                }
            }
        }
    }

    return moveList;
}

// Print the move in LAN
function getMoveString(move) {
    return FILE_TO_STRING[move.from.file] + 
            RANK_TO_STRING[move.from.rank] + 
            FILE_TO_STRING[move.to.file] + 
            RANK_TO_STRING[move.to.rank] +
            (move.promotion !== NO_PIECE ? PIECE_STRING_LUT[move.promotion].toLowerCase() : "");
}

// Print the board to console
function printBoard() {
    let output = "";
    for(let r = 7; r >= 0; r--) {
        for(let f = 0; f < 8; f++) {
            if(board[r][f] === NO_PIECE) output += "-";
            else {
                let type = getPieceType(board[r][f]);
                let piece = PIECE_STRING_LUT[type];
                if(getPieceColor(board[r][f]) == BLACK) piece = piece.toLowerCase();
                output += piece;
            }
            output += "  ";
        }
        output += "  " + RANK_TO_STRING[r] + "\r\n";
    }
    output += "\r\na  b  c  d  e  f  g  h";
    console.log(output);
    console.log("Castling:\t" + castlingRightsToString());
    console.log("En passant:\t" + (enPassantSquare !== undefined ? (FILE_TO_STRING[enPassantSquare.file]) + RANK_TO_STRING[enPassantSquare.rank]: "-"));
    console.log();
}

// Save board state into JSON
function saveBoardState() {
    let boardcopy = new Array(8);
    for(let j = 0; j < 8; j++) boardcopy[j] = board[j].slice(0);
    let castlingcopy = [
        {           // 0
            kingSide: castlingRights[WHITE].kingSide,
            queenSide: castlingRights[WHITE].queenSide
        }, {}, {}, {}, {}, {}, {}, {},
        {           // 8
            kingSide: castlingRights[BLACK].kingSide,
            queenSide: castlingRights[BLACK].queenSide
        }
    ];
    let kingsquarecopy = { file: kingSquare[currentColor].file, rank: kingSquare[currentColor].rank };
    return {
        board: boardcopy,
        enpassant: enPassantSquare !== undefined ? { file: enPassantSquare.file, rank: enPassantSquare.rank } : undefined,
        castling: castlingcopy,
        color: currentColor,
        kingsquare: kingsquarecopy
    }
}

// Reset board state given JSON
function loadBoardState(savedstate) {
    currentColor = savedstate.color;
    castlingRights = savedstate.castling;
    enPassantSquare = savedstate.enpassant;
    board = savedstate.board;
    kingSquare[currentColor] = savedstate.kingsquare;
}

// Performance test driver
function perft(depth) {
    function perftHelper(depth) {
        if(depth === 0) {
            return 1;
        }
        let nodes = 0;
        let moves = generateMoves();
        for(let i = 0; i < moves.length; i++) {
            performMove(moves[i]);
            if(!isSquareAttackedBySide(currentColor, kingSquare[currentColor ^ BLACK])) nodes += perftHelper(depth - 1);
            unperformMove(moves[i]);
        }
        return nodes;
    }
    if(depth === 0) return 1;
    let nodes = 0;
    let start = Date.now();
    let moves = generateMoves();
    let output = "";
    for(let i = 0; i < moves.length; i++) {
        performMove(moves[i]);
        if(!isSquareAttackedBySide(currentColor, kingSquare[currentColor ^ BLACK])) {
            let subnodes = perftHelper(depth - 1);
            output += getMoveString(moves[i]) + ": " + subnodes + "\r\n";
            nodes += subnodes;
        }
        unperformMove(moves[i]);
    }
    let end = Date.now();
    output += "\r\n~ ~ ~ ~ ~ ~ Results Depth " + depth + " ~ ~ ~ ~ ~ ~\r\n";
    output += "Nodes searched:\t" + nodes + "\r\n";
    output += "Time elapsed:\t" + (end - start) + " ms\r\n";
    output += "NPS:\t\t" + (nodes * 1000 / (end - start)) + "\r\n";
    console.log(output);
    return nodes;
}

// Regression suite
function regressionTests() {
    let testList = [
        {
            fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            depth: 6,
            nodes: 119060324
        },
        {
            fen: "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
            depth: 5,
            nodes: 193690690
        },
        {
            fen: "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",
            depth: 7,
            nodes: 178633661
        },
        {
            fen: "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1",
            depth: 6,
            nodes: 706045033
        },
        {
            fen: "r2q1rk1/pP1p2pp/Q4n2/bbp1p3/Np6/1B3NBn/pPPP1PPP/R3K2R b KQ - 0 1",
            depth: 6,
            nodes: 706045033
        },
        {
            fen: "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8",
            depth: 5,
            nodes: 89941194
        },
        {
            fen: "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10",
            depth: 5,
            nodes: 164075551
        }
    ];

    // Run tests
    for(let t = 0; t < testList.length; t++) {
        let fen = testList[t].fen;
        let depth = testList[t].depth;
        let nodes = testList[t].nodes;
        loadFromFEN(fen);
        let result = perft(depth);
        if(result === nodes) console.log("~  ~  ~  ~  ~  ~  ~  ~  ~ PASSED ~  ~  ~  ~  ~  ~  ~  ~  ~");
        else console.log("~  ~  ~  ~  ~  ~  ~  ~  ~ FAILED ~  ~  ~  ~  ~  ~  ~  ~  ~");
    }
}

// ----------------------------------- EVALUATION -----------------------------------------
/*
    Brief explanations of the algorithm and optimizations used:

    --- Minimax ---
    Minimax is a very aged algorithm that checks all of the current player's moves and evaluates which ones have the best outcome for the current player. 
    It does this by performing all of said moves, and then calculating the opponent's moves and seeing which of those moves give the best outcome for the 
    opponent. As you may notice, this can be done recursively. The underlying assumption is that the opponent will always play the best move it finds, 
    meaning the strength of a given move depends on the strongest opposing subsequent move. In other words, the move that minimizes the opponent's 
    advantage is the move that maximizes the current player's advantage. We can recurse until the end of the game (either a win or a draw), but the number 
    of positions to look at grows exponentially the deeper we go. This is not at all realistic, so we can use a depth limit upto a specific point. For 
    example, we recurse 4 turns in and then stop there (which would make this the leaf node of our recursion tree). The problem is... what do we return 
    when we stop there? This is where an evaluation function is useful. Chess positional evaluation is a very deep topic that this application does not go 
    into, and is the focus of many neural network based chess engines out there (Quite frankly, I am not smart enough). However, we can employ something 
    much simpler and pray that it works out for us. We can count pawns at the end of our recursion; we can total up the number of pieces the current 
    player has versus the total number of pieces the opponent has (Of course, accommodating for the fact that some pieces are worth more than one pawn etc). 
    If one side has more pieces than the other, we can just return the difference in material count.
    --- Quiescence ---
    The problem with just stopping at the leaf nodes is that there's no consideration for where the pieces are at the moment we count pawns. For example, 
    for one line we may end up with a bishop more than our opponent, but our queen might be directly attacked by the enemy's pawn (on the enemy's turn). 
    If we stop the recursion here and return the pawn-counted evaluation, our evaluation will claim that we are winning in this position when we are 
    definitely not. The solution for this is that, when we get to the end of our minimax recursion, we start a different recursive search that looks through 
    all of the possible capture moves from that point. This alternative recursive search will not be limited by depth, but will continue until there are no 
    captures possible and then this search functon can return the pawn-counted evaluation. This ensures that we do not return any positions where an immediate 
    capture is possible. This search is dubbed the "quiescence" search, because it ensures we only count pawns for "quiet" positions.
    --- Alpha-Beta pruning ---
    As great as both of those searching algorithms are, they are very slow. In fact, each of those searches will look through every possible move that it finds. 
    Quite frankly, this is not efficient. But there is a very key detail to how minimax works: Imagine a scenario where we, as white, evaluate two of our 
    possible moves A and B. Imagine for move A, we find that black has possible moves that give us an evaluation of 1, -3, -2 (these numbers are utterly made 
    up, heh). This means that the best move for black after move A gives black an advantage of +3, hence gives move A an evaluation of -3 for us. We then look 
    through the black's moves after our move B, and find out instantly that black's first option gives black a score of +5, or -5 for us. -5 is already worse for 
    us than -3, which means that in any case, the worst outcome from move B is WORSE than the worst outcome from move A. At that point, there is no point 
    calculating the rest of black's moves after white's move B, because we already know that move B is out of the question. This optimization is called 
    alpha-beta pruning, and it significantly speeds up our search.
    --- Move sorting ---
    A further key detail to how alpha-beta pruning works is that if we find good moves for the current player early on, then it becomes much easier to reject 
    other moves that are immediately worse than our "best" move. This is important, because we know that we want to evaluate potentially good moves first! A trick 
    for this is making guesses about moves. We can't specifically know what moves are good and what moves are bad, because that's the job of the search function. 
    However, there are certain moves that are very likely to be bad. For example, taking a pawn with a queen is likely not as good a move as taking a queen with 
    a pawn. With this logic we can attempt to make guesses about which moves are likely good, and which moves are likely bad, and give them numeric guess scores. 
    We can use these scores to then sort the list of moves such that our search function will look at the "likely good" moves first.
*/

// Current best move in the position
var currentBestMove = undefined;

const INF_SCORE = 100000;
const CHECK_MATE_WEIGHT = INF_SCORE - 1000;
const PIECE_WEIGHTS = [
    [INF_SCORE, 900, 320, 310, 500, 100],              // 0
    [], [], [], [], [], [], [], 
    [-INF_SCORE, -900, -320, -310, -500, -100]         // 8
];

const PIECE_SQUARE_VALUES = [
    [                                       // 0
        // KING --- WHITE
        [
                20, 30, 10,  0,  0, 10, 30, 20,
                20, 20,  0,  0,  0,  0, 20, 20,
            -10,-20,-20,-20,-20,-20,-20,-10,
            -20,-30,-30,-40,-40,-30,-30,-20,
            -30,-40,-40,-50,-50,-40,-40,-30,
            -30,-40,-40,-50,-50,-40,-40,-30,
            -30,-40,-40,-50,-50,-40,-40,-30,
            -30,-40,-40,-50,-50,-40,-40,-30
        ],
        // QUEEN --- WHITE
        [
            0,  0,  0,  0,  0,  0,  0,  0,
            0,  0,  0,  0,  0,  0,  0,  0,
            0,  0,  0,  0,  0,  0,  0,  0,
            0,  0,  0,  0,  0,  0,  0,  0,
            0,  0,  0,  0,  0,  0,  0,  0,
            0,  0,  0,  0,  0,  0,  0,  0,
            0,  0,  0,  0,  0,  0,  0,  0,
            0,  0,  0,  0,  0,  0,  0,  0
        ],
        // BISHOP --- WHITE
        [
            -20,-10,-10,-10,-10,-10,-10,-20,
            -10,  5,  0,  0,  0,  0,  5,-10,
            -10, 10, 10, 10, 10, 10, 10,-10,
            -10,  0, 10, 10, 10, 10,  0,-10,
            -10,  5,  5, 10, 10,  5,  5,-10,
            -10,  0,  5, 10, 10,  5,  0,-10,
            -10,  0,  0,  0,  0,  0,  0,-10,
            -20,-10,-10,-10,-10,-10,-10,-20
        ],
        // KNIGHT --- WHITE
        [
            -50,-30,-30,-30,-30,-30,-30,-50,
            -30,-20,  0,  0,  0,  0,-20,-30,
            -30,  0,  5,  5,  5,  5,  0,-30,
            -30,  0,  5,  5,  5,  5,  0,-30,
            -30,  0,  5,  5,  5,  5,  0,-30,
            -30,  0,  5,  5,  5,  5,  0,-30,
            -30,-20,  0,  0,  0,  0,-20,-30,
            -50,-30,-30,-30,-30,-30,-30,-50
        ],
        // ROOK --- WHITE
        [
                0,  0,  0,  5,  5,  0,  0,  0,
            -5,  0,  0,  0,  0,  0,  0, -5,
            -5,  0,  0,  0,  0,  0,  0, -5,
            -5,  0,  0,  0,  0,  0,  0, -5,
            -5,  0,  0,  0,  0,  0,  0, -5,
            -5,  0,  0,  0,  0,  0,  0, -5,
                5, 10, 10, 10, 10, 10, 10,  5,
                0,  0,  0,  0,  0,  0,  0, -0
        ],
        // PAWN --- WHITE
        [
                0,  0,  0,  0,  0,  0,  0,  0,
                5, 10, 10,-20,-20, 10, 10,  5,
                5, -5,-10,  0,  0,-10, -5,  5,
                0,  0,  0, 35, 35,  0,  0,  0,
                5,  5, 15, 40, 40, 15,  5,  5,
            10, 10, 25, 45, 45, 25, 10, 10,
            50, 50, 50, 50, 50, 50, 50, 50,
                0,  0,  0,  0,  0,  0,  0,  0
        ]
    ],
    [], [], [], [], [], [], [], 
    [                                       // 8
        // KING --- BLACK
        [
                30, 40, 40, 50, 50, 40, 40, 30,
                30, 40, 40, 50, 50, 40, 40, 30,
                30, 40, 40, 50, 50, 40, 40, 30,
                30, 40, 40, 50, 50, 40, 40, 30,
                20, 30, 30, 40, 40, 30, 30, 20,
                10, 20, 20, 20, 20, 20, 20, 10,
            -20,-20,  0,  0,  0,  0,-20,-20,
            -20,-30,-10,  0,  0,-10,-30,-20
        ],
        // QUEEN --- BLACK
        [
            0,  0,  0,  0,  0,  0,  0,  0,
            0,  0,  0,  0,  0,  0,  0,  0,
            0,  0,  0,  0,  0,  0,  0,  0,
            0,  0,  0,  0,  0,  0,  0,  0,
            0,  0,  0,  0,  0,  0,  0,  0,
            0,  0,  0,  0,  0,  0,  0,  0,
            0,  0,  0,  0,  0,  0,  0,  0,
            0,  0,  0,  0,  0,  0,  0,  0
        ],
        // BISHOP --- BLACK
        [
            20, 10, 10, 10, 10, 10, 10, 20,
            10,  0,  0,  0,  0,  0,  0, 10,
            10,  0,-10,-10,-10,-10,  0, 10,
            10, -5,-10,-10,-10,-10,  0, 10,
            10,  0,-10,-10,-10,-10,  0, 10,
            10,-10,-10,-10,-10,-10,  0, 10,
            10, -5,  0,  0,  0,  0, -5, 10,
            20, 10, 10, 10, 10, 10, 10, 20
        ],
        // KNIGHT --- BLACK
        [
            50, 30, 30, 30, 30, 30, 30, 50,
            30, 20,  0,  0,  0,  0, 20, 30,
            30,  0, -5, -5, -5, -5,  0, 30,
            30,  0, -5, -5, -5, -5,  0, 30,
            30,  0, -5, -5, -5, -5,  0, 30,
            30,  0, -5, -5, -5, -5,  0, 30,
            30, 20,  0,  0,  0,  0, 20, 30,
            50, 30, 30, 30, 30, 30, 30, 50
        ],
        // ROOK --- BLACK
        [
            0,  0,  0,  0,  0,  0,  0,  0,
            -5,-10,-10,-10,-10,-10,-10, -5,
            5,  0,  0,  0,  0,  0,  0,  5,
            5,  0,  0,  0,  0,  0,  0,  5,
            5,  0,  0,  0,  0,  0,  0,  5,
            5,  0,  0,  0,  0,  0,  0,  5,
            5,  0,  0,  0,  0,  0,  0,  5,
            0,  0,  0, -5, -5,  0,  0, -0
        ],
        // PAWN --- BLACK
        [
            0,  0,  0,  0,  0,  0,  0,  0,
            -50,-50,-50,-50,-50,-50,-50,-50,
            -10,-10,-25,-45,-45,-25,-10,-10,
            -5, -5,-15,-40,-40,-15, -5, -5,
            0,  0,  0,-35,-35,  0,  0,  0,
            -5,  5, 10,  0,  0, 10,  5, -5,
            -5,-10,-10, 20, 20,-10,-10, -5,
            0,  0,  0,  0,  0,  0,  0, -0
        ]
    ]
];

const PROMOTION_VALUES = [0, 900, 320, 310, 500, 0];

// Pawn counting to get positional evaluation
function evaluatePosition() {
    let eval = 0;
    for(let rank = 0; rank < 8; rank++) {
        for(let file = 0; file < 8; file++) {
            let piece = board[rank][file];
            if(piece !== NO_PIECE) eval += PIECE_WEIGHTS[getPieceColor(piece)][getPieceType(piece)] + 
                                            PIECE_SQUARE_VALUES[getPieceColor(piece)][getPieceType(piece)][rank * 8 + file];
        }
    }
    return currentColor === WHITE ? eval : -eval;
}

// Guess for a move's score before making the move
function getMoveScore(move) {
    let movedpiece = move.movedpiece;
    let takenpiece = move.takenpiece;

    // Captures. Taking a high value piece with a low value piece is a better move than vice versa (Magnified with multiplier)
    if(takenpiece !== NO_PIECE) return 2 * (Math.abs(PIECE_WEIGHTS[getPieceColor(takenpiece)][getPieceType(takenpiece)]) - 
                                            Math.abs(PIECE_WEIGHTS[getPieceColor(movedpiece)][getPieceType(movedpiece)]));
    // Quiet moves
    else {
        let value = 0;

        // Pawn promotions
        if(move.promotion !== NO_PIECE) value += PROMOTION_VALUES[move.promotion];
        
        // Try not move to the enemy pawn attacks
        // TODO FIX THIS LMAO
        // let color = getPieceColor(move.movedpiece);
        // if(color === WHITE) {
        //     if((move.to.file > 0 && board[move.to.rank + 1][move.to.file - 1] === (BLACK | PAWN)) ||
        //        (move.to.file < 7 && board[move.to.rank + 1][move.to.file + 1] === (BLACK | PAWN))) {
        //         value -= Math.abs(PIECE_WEIGHTS[getPieceColor(takenpiece)][getPieceType(takenpiece)]);
        //     }
        // }
        // else {
        //     if((move.to.file > 0 && board[move.to.rank - 1][move.to.file - 1] === (WHITE | PAWN)) ||
        //        (move.to.file < 7 && board[move.to.rank - 1][move.to.file + 1] === (WHITE | PAWN))) {
        //         value -= Math.abs(PIECE_WEIGHTS[getPieceColor(takenpiece)][getPieceType(takenpiece)]);
        //     }
        // }
        
        // TODO: Add more attributes 
        
        return value;
    }
}

// Quiescense search for captures only
function quiescenceSearch(alpha, beta) {
    let eval = evaluatePosition();
    if(eval >= beta) return beta;
    if(eval > alpha) alpha = eval;

    let moves = generateMoves(true);
    moves.sort((a, b) => { return getMoveScore(b) - getMoveScore(a) });

    for(let i = 0; i < moves.length; i++) {
        performMove(moves[i]);
        let score = undefined;

        // Make sure the move is legal
        if(!isSquareAttackedBySide(currentColor, kingSquare[currentColor ^ BLACK])) {
            score = -quiescenceSearch(-beta, -alpha);
        }
        unperformMove(moves[i]);

        if(score !== undefined) {
            // Fail hard high
            if(score >= beta) {
                return beta;
            }

            // Found best move
            if(score > alpha) {
                alpha = score;
            }
        }
    }

    // Fail hard low
    return alpha;
}

// Technically negamax :3
function minimaxSearch(depth, maxDepth, alpha, beta) {
    if(depth === 0) {
        return quiescenceSearch(alpha, beta);
    }

    let moves = generateMoves();
    moves.sort((a, b) => { return getMoveScore(b) - getMoveScore(a) });

    let noMoves = true;             // Checkmate or stalemate
    let foundBest = false;
    let bestMove = undefined;

    for(let i = 0; i < moves.length; i++) {
        performMove(moves[i]);
        let score = undefined;

        // Make sure the move is legal
        if(!isSquareAttackedBySide(currentColor, kingSquare[currentColor ^ BLACK])) {
            score = -minimaxSearch(depth - 1, maxDepth, -beta, -alpha);
            noMoves = false;
        }
        unperformMove(moves[i]);

        if(score !== undefined) {
            // Fail hard high
            if(score >= beta) {
                return beta;
            }

            // Found best move
            if(score > alpha) {
                alpha = score;
                if(depth === maxDepth) {
                    bestMove = moves[i];
                    foundBest = true;
                }
            }
        }
    }

    if(noMoves) return isSquareAttackedBySide(currentColor ^ BLACK, kingSquare[currentColor]) ? -CHECK_MATE_WEIGHT - depth : 0;
    if(foundBest) currentBestMove = bestMove;
    // Fail hard low
    return alpha;
}

// Search for the best move in the given position
function searchPosition(depth) {
    console.log(depth);
    currentBestMove = undefined;
    return minimaxSearch(depth, depth, -INF_SCORE, INF_SCORE);
}

// ----------------------------------- UI CONTROL -----------------------------------------

// User variables
var PGN = "";
var currentGameMoves = [];
var selectedSquare = undefined;
var playerTurn = true;
var botDepth = 4;

const PIECE_IMG_SRC = [
    ["WK", "WQ", "WB", "WN", "WR", "WP"],     // 0
    [], [], [], [], [], [], [],
    ["BK", "BQ", "BB", "BN", "BR", "BP"]      // 8
];

// Convert a move to algebraic notation
function getAlgebraicNotation(move) {
    let notation = getSquareString(move.to);
    let movedpiece = move.movedpiece;
    let side = getPieceColor(movedpiece);
    let pieceId = PIECE_STRING_LUT[getPieceType(movedpiece)];
    let isPawn = pieceId === "P" ? true : false;

    // Castling
    if(pieceId === "K" && move.from.file === 4) {
        if(move.to.file === move.from.file + 2) return "O-O";
        else if(move.to.file === move.from.file - 2) return "O-O-O";
    }

    // Captures
    if(board[move.to.rank][move.to.file] !== NO_PIECE || (isPawn && enPassantSquare !== undefined && enPassantSquare.file === move.to.file && enPassantSquare.rank === move.to.rank)) {
        notation = "x" + notation;
        if(isPawn) notation = FILE_TO_STRING[move.from.file] + notation;
    }

    // For all pieces beside pawns
    let includeFile = false, includeRank = false;
    if(!isPawn) {
        // Check if multiple pieces of the same type can move to the same final coordinate
        for(let i = 0; i < currentGameMoves.length; i++) {
            let from = currentGameMoves[i].from;
            if(from.file === move.from.file && from.rank === move.from.rank) continue;                              // Not the same piece
            if(pieceId.toUpperCase() !== PIECE_STRING_LUT[getPieceType(board[from.rank][from.file])]) continue;	    // Only for same piece types
            let to = currentGameMoves[i].to;
            if(to.file === move.to.file && to.rank === move.to.rank) {
                if(from.file !== move.from.file) includeFile = true;
                else if(from.rank !== move.from.rank) includeRank = true;
            }
        }
        if(includeRank) notation = RANK_TO_STRING[move.from.rank] + notation;
        if(includeFile) notation = FILE_TO_STRING[move.from.file] + notation;

        notation = side === WHITE ? pieceId + notation : pieceId.toUpperCase() + notation;
    }

    // Promotions
    if(move.promotion !== NO_PIECE) {
        notation += "=" + PIECE_STRING_LUT[move.promotion];
    }
    return notation;
}

// Check if the game has ended
function getGameOver() {
    let legalsFound = false;
    let moves = generateMoves();
    for(let i = 0; i < moves.length; i++) {
        performMove(moves[i]);
        if(!isSquareAttackedBySide(currentColor, kingSquare[currentColor ^ BLACK])) {
            legalsFound = true;
        }
        unperformMove(moves[i]);
        if(legalsFound) break;
    }
    return !legalsFound;
}

// Add algebraic notation to PGN
function appendPGN(notation) {
    if(currentColor === BLACK) PGN += fullClock + ". ";
    PGN += notation;
    if(getGameOver()) {
        if(isSquareAttackedBySide(currentColor ^ BLACK, kingSquare[currentColor])) {
            PGN += "#";
            alert("CHECKMATE");
        }
        else alert("STALEMATE");
    }
    else if(isSquareAttackedBySide(currentColor ^ BLACK, kingSquare[currentColor])) PGN += "+";
    PGN += " ";
}

async function nextTurn() {
    playerTurn = !playerTurn;
    if(!playerTurn) {
        setTimeout(() => {
            let score = searchPosition(botDepth);
            if(currentBestMove === undefined) console.log("Game over");
            else makeMoveOnBoard(currentBestMove);
        }, 10);
    }
}

// Set up board colors 
function updateBoardColors() {
    for(let rank = 0; rank < 8; rank++) {
        for(let file = 0; file < 8; file++) {
            let id = getSquareString({ file:file, rank:rank });
            if((rank + file) % 2 == 0) document.getElementById(id).setAttribute("class", "black-button");
            else document.getElementById(id).setAttribute("class", "white-button");
        }
    }
}

// Set the board images
function updateUIData() {
    // Update board visuals
    for(let rank = 0; rank < 8; rank++) {
        for(let file = 0; file < 8; file++) {
            let color = getPieceColor(board[rank][file]);
            let type = getPieceType(board[rank][file]);
            let value = board[rank][file] !== NO_PIECE ? PIECE_IMG_SRC[color][type] : "NP";
            let id = getSquareString({ file:file, rank:rank });
            document.getElementById(id).children[0].setAttribute("src", "assets/" + value + ".png");
        }
    }
    // Update PGN text area
    document.getElementById("pgn-text").value = PGN;
}

// Populate the local list with the current position's legal moves
function getLegalMoves() {
    currentGameMoves = generateMoves();
    for(let i = 0; i < currentGameMoves.length; i++) {
        performMove(currentGameMoves[i]);
        let remove = false;
        if(isSquareAttackedBySide(currentColor, kingSquare[currentColor ^ BLACK])) remove = true;
        unperformMove(currentGameMoves[i]);
        if(remove) {
            currentGameMoves.splice(i, 1);
            i--;
        }
    }
}

// Perform user move
function makeMoveOnBoard(move) {
    if(move !== undefined) {
        let notation = getAlgebraicNotation(move);
        performMove(move);
        appendPGN(notation);
        updateUIData();
        getLegalMoves();
        if(currentColor === WHITE) fullClock++;
        nextTurn();
    }
}

// Manage square clicks
function clickSquare(id) {
    // Skip if not player's turn
    if(!playerTurn) return;

    updateBoardColors();
    let square = parseSquare(id);
    let selectedMove = undefined;

    for(let i = 0; i < currentGameMoves.length && selectedSquare !== undefined; i++) {
        let move = currentGameMoves[i];
        if(selectedSquare.file === move.from.file && selectedSquare.rank === move.from.rank && 
            square.file === move.to.file && square.rank === move.to.rank ) {
            selectedMove = move;
            break;
        }
    }

    if(selectedMove !== undefined) {
        makeMoveOnBoard(selectedMove);
    }
    else {
        let squareMoves = [];
        for(let i = 0; i < currentGameMoves.length; i++) {
            let move = currentGameMoves[i];
            if(move.from.file === square.file && move.from.rank === square.rank) squareMoves.push(move);
        }
        for(let i = 0; i < squareMoves.length; i++) {
            let move = squareMoves[i];
            let id = getSquareString(move.to);
            if((move.to.rank + move.to.file) % 2 == 0) document.getElementById(id).setAttribute("class", "black-button button-move");
            else document.getElementById(id).setAttribute("class", "white-button button-move");
        }
        selectedSquare = square;
        if(squareMoves.length > 0) {
            if((selectedSquare.rank + selectedSquare.file) % 2 == 0) document.getElementById(getSquareString(selectedSquare)).setAttribute("class", "black-button button-select");
            else document.getElementById(id).setAttribute("class", "white-button button-select");
        }
    }
}

// Change the AI depth
function changeDepth() {
    botDepth = Number(document.getElementById("depth-select").value);
}

// Copy PGN text to clip board
function copyPGN() {
    let taPGN = document.getElementById("pgn-text");
    taPGN.setSelectionRange(0, 99999);
    document.execCommand("copy");
    alert("Copied PGN");
}

// ----------------------------------- DRIVER CODE -----------------------------------------

// Initialize game
updateUIData();
loadFromFEN(STARTING_FEN);
updateBoardColors();
updateUIData();
changeDepth();
getLegalMoves();