/**
 * Puerto de hashing de contrasenas (seccion 9.5).
 *
 * Nota de desviacion documentada (instruccion 11): la seccion 4 no lista este
 * puerto entre los 6 originales, pero la seccion 9.5 exige "un adaptador propio,
 * nunca llamar la libreria directo desde el caso de uso" para bcrypt, y la
 * seccion 4 SI nombra `BcryptAdapter.ts` como adaptador de infraestructura.
 * Un adaptador solo tiene sentido en Clean Architecture si implementa una
 * interfaz de dominio (seccion 3); sin este puerto, RegisterUser/LoginUser
 * tendrian que importar bcrypt directamente, violando esa regla y quedando
 * imposibles de testear con puertos mockeados (exigido en el criterio de
 * aceptacion de la Fase 3).
 */
export interface PasswordHasher {
  hash(plainPassword: string): Promise<string>;
  compare(plainPassword: string, hash: string): Promise<boolean>;
}
