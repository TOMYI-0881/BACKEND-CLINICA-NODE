/**
 * Base de la jerarquia de errores de dominio. Cada subclase fija su propio
 * codigo HTTP para que errorHandler (presentation) los mapee sin conocer
 * detalles de negocio.
 */
export abstract class CustomError extends Error {
  abstract readonly statusCode: number;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
