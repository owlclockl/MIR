// The civilization of the sages browser adapter, GPL-3.0-or-later. RTplatec source remains unmodified.
#include "lithosphere.hpp"
#include "FractalGenerator.h"
#include <cstdlib>
extern "C" {
void* rt_create(int seed, unsigned w, unsigned h, float sea, float fold, unsigned abs, float rel, unsigned plates, float rough) {
    srand(seed);
    return new lithosphere(seed, w, h, sea, fold, abs, rel, plates, rough);
}
void rt_destroy(void* p) { delete static_cast<lithosphere*>(p); }
float* rt_height(void* p) { return static_cast<lithosphere*>(p)->getTopography(); }
unsigned* rt_plates(void* p) { return static_cast<lithosphere*>(p)->getPlatesMap(); }
void rt_step(void* p) { static_cast<lithosphere*>(p)->update(); }
void rt_restart(void* p) { static_cast<lithosphere*>(p)->restart(); }
void rt_set(void* p, float* values) { static_cast<lithosphere*>(p)->setTopography(values); }
void rt_params(void* p, float fold, unsigned abs, float rel) {
    auto* l = static_cast<lithosphere*>(p); l->folding_ratio = fold; l->aggr_overlap_abs = abs; l->aggr_overlap_rel = rel;
}
void rt_noise(float* map, unsigned w, unsigned h, int seed, float rough, int turbulence) {
    FractalGenerator::noiseTurbulence(map, w, h, seed, rough, turbulence);
}
void* rt_alloc(unsigned bytes) { return malloc(bytes); }
void rt_free(void* p) { free(p); }
}
