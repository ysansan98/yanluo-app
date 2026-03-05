cmake_minimum_required(VERSION 3.20)
project(keyboard_helper LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

set(KEYBOARD_HELPER_INCLUDE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/include)

if(APPLE)
  add_library(KeyboardHelper SHARED src/macos/keyboard_helper_mac.mm)
  target_include_directories(KeyboardHelper PRIVATE ${KEYBOARD_HELPER_INCLUDE_DIR})
  target_link_libraries(KeyboardHelper PRIVATE
    "-framework CoreFoundation"
    "-framework CoreGraphics"
    "-framework Carbon"
    "-framework ApplicationServices"
  )
  set_target_properties(KeyboardHelper PROPERTIES
    OUTPUT_NAME "KeyboardHelper"
    PREFIX "lib"
    SUFFIX ".dylib"
  )
elseif(WIN32)
  add_library(KeyboardHelper SHARED src/windows/keyboard_helper_win.cpp)
  target_include_directories(KeyboardHelper PRIVATE ${KEYBOARD_HELPER_INCLUDE_DIR})
  target_link_libraries(KeyboardHelper PRIVATE user32)
  set_target_properties(KeyboardHelper PROPERTIES OUTPUT_NAME "KeyboardHelper")
else()
  message(FATAL_ERROR "keyboard-helper currently supports macOS and Windows only")
endif()
