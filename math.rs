use std::f64;

#[no_mangle]
pub fn add(a: f64, b: f64) -> f64 {
  return a + b
}

#[no_mangle]
pub fn subtract(a: f64, b: f64) -> f64 {
  return a - b
}


#[no_mangle]
pub fn multiply(a: f64, b: f64) -> f64 {
  return a * b
}
