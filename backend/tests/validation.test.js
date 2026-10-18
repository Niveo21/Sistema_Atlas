// Pruebas unitarias de validación y errores: no usan base de datos.
const { validatePassword, requireString, requireEmail, positiveInt } = require('../src/utils/validation');
const { AppError, badRequest, unauthorized, forbidden, notFound, conflict } = require('../src/utils/errors');

// Devuelve el error de validación de la contraseña, o null si la acepta.
function errorDePassword(password) {
  try {
    validatePassword(password);
    return null;
  } catch (err) {
    return err;
  }
}

describe('validatePassword (política ERS 2.4)', () => {
  test('acepta una contraseña que cumple todas las reglas', () => {
    expect(errorDePassword('Clave-Segura-2026')).toBeNull();
  });

  test('acepta exactamente 12 caracteres', () => {
    expect(errorDePassword('Abcdefg-1234')).toBeNull();
  });

  test('rechaza 11 caracteres con el mensaje de longitud', () => {
    const err = errorDePassword('Abcdef-1234'); // 11 caracteres
    expect(err).toBeInstanceOf(AppError);
    expect(err.status).toBe(400);
    expect(err.message).toBe('Contraseña no cumple la política');
    expect(err.details).toEqual(['Mínimo 12 caracteres']);
  });

  test('exige una mayúscula', () => {
    expect(errorDePassword('abcdefg-1234').details).toEqual(['Debe incluir una mayúscula']);
  });

  test('exige una minúscula', () => {
    expect(errorDePassword('ABCDEFG-1234').details).toEqual(['Debe incluir una minúscula']);
  });

  test('exige un número', () => {
    expect(errorDePassword('Abcdefgh-ijkl').details).toEqual(['Debe incluir un número']);
  });

  test('exige un símbolo', () => {
    expect(errorDePassword('Abcdefgh1234').details).toEqual(['Debe incluir un símbolo']);
  });

  test('informa todas las reglas que faltan a la vez', () => {
    expect(errorDePassword('abc').details).toEqual([
      'Mínimo 12 caracteres',
      'Debe incluir una mayúscula',
      'Debe incluir un número',
      'Debe incluir un símbolo',
    ]);
  });

  test('rechaza un valor que no es texto', () => {
    expect(errorDePassword(123456789012).details).toContain('Mínimo 12 caracteres');
  });
});

describe('requireString', () => {
  test('lanza error si el campo falta, es null o está vacío', () => {
    for (const body of [{}, { nombre: null }, { nombre: '' }]) {
      expect(() => requireString(body, 'nombre')).toThrow('El campo nombre es obligatorio');
    }
  });

  test('devuelve null si el campo es opcional y falta', () => {
    expect(requireString({}, 'nombre', { optional: true })).toBeNull();
  });

  test('recorta los espacios de los extremos', () => {
    expect(requireString({ nombre: '  hola  ' }, 'nombre')).toBe('hola');
  });

  test('acepta un texto de exactamente max caracteres', () => {
    expect(requireString({ nombre: 'abcde' }, 'nombre', { max: 5 })).toBe('abcde');
  });

  test('rechaza un texto más largo que max', () => {
    expect(() => requireString({ nombre: 'abcdef' }, 'nombre', { max: 5 })).toThrow(
      'El campo nombre no es válido (máximo 5 caracteres)'
    );
  });

  test('rechaza un valor que no es texto', () => {
    expect(() => requireString({ nombre: 5 }, 'nombre')).toThrow('no es válido');
  });
});

describe('requireEmail', () => {
  test('normaliza el correo a minúsculas', () => {
    expect(requireEmail({ correo: 'Usuario@Correo.CL' }, 'correo')).toBe('usuario@correo.cl');
  });

  test('rechaza un correo sin arroba', () => {
    expect(() => requireEmail({ correo: 'sin-arroba.cl' }, 'correo')).toThrow('no tiene formato de correo');
  });

  test('rechaza un correo con espacios', () => {
    expect(() => requireEmail({ correo: 'a b@c.cl' }, 'correo')).toThrow('no tiene formato de correo');
  });

  test('rechaza texto extra después del dominio', () => {
    expect(() => requireEmail({ correo: 'usuario@correo.cl@extra' }, 'correo')).toThrow('no tiene formato de correo');
  });

  test('rechaza un correo de más de 254 caracteres', () => {
    const largo = `${'a'.repeat(250)}@x.cl`; // 255 caracteres
    expect(() => requireEmail({ correo: largo }, 'correo')).toThrow('no es válido');
  });
});

describe('positiveInt', () => {
  test('acepta enteros positivos, también como texto', () => {
    expect(positiveInt('3', 'id')).toBe(3);
    expect(positiveInt(7, 'id')).toBe(7);
    expect(positiveInt(1, 'id')).toBe(1);
  });

  test('rechaza cero, negativos, decimales y texto no numérico', () => {
    for (const valor of [0, -1, 1.5, 'abc']) {
      expect(() => positiveInt(valor, 'id')).toThrow('id debe ser un entero positivo');
    }
  });
});

describe('errors', () => {
  test('cada constructor usa su código HTTP', () => {
    expect(badRequest('x').status).toBe(400);
    expect(unauthorized().status).toBe(401);
    expect(forbidden().status).toBe(403);
    expect(notFound().status).toBe(404);
    expect(conflict('x').status).toBe(409);
  });

  test('usa mensajes por defecto cuando no se entrega uno', () => {
    expect(unauthorized().message).toBe('No autenticado');
    expect(forbidden().message).toBe('Sin permisos para esta operación');
    expect(notFound().message).toBe('Recurso no encontrado');
  });

  test('conserva los detalles entregados', () => {
    expect(badRequest('x', ['d']).details).toEqual(['d']);
  });
});
