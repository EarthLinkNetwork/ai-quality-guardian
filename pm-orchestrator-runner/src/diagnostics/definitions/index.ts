/**
 * Diagnostic Definitions Index
 *
 * All diagnostic definitions are registered here.
 * To add a new diagnostic, create a definition file and add it to this list.
 */

import { DiagnosticDefinition } from '../definition';
import { distIntegrityDiagnostic } from './dist-integrity';

/**
 * All built-in diagnostic definitions.
 */
export const builtinDiagnostics: DiagnosticDefinition[] = [
  distIntegrityDiagnostic,
];

export { distIntegrityDiagnostic };
