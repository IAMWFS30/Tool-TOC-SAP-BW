CLASS zcl_transport_import DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES if_http_extension.

  PROTECTED SECTION.
  PRIVATE SECTION.
    METHODS create_toc
      IMPORTING
        iv_description TYPE string
        iv_target      TYPE string
      EXPORTING
        ev_trkorr      TYPE trkorr
        ev_success     TYPE abap_bool
        ev_message     TYPE string.

    METHODS copy_objects
      IMPORTING
        iv_source TYPE trkorr
        iv_target TYPE trkorr
      EXPORTING
        ev_success TYPE abap_bool
        ev_message TYPE string.

    METHODS release_transport
      IMPORTING
        iv_trkorr  TYPE trkorr
      EXPORTING
        ev_success TYPE abap_bool
        ev_message TYPE string.

    METHODS get_request_body
      IMPORTING
        io_server      TYPE REF TO if_http_server
      RETURNING
        VALUE(rv_body) TYPE string.

    METHODS send_json_response
      IMPORTING
        io_server  TYPE REF TO if_http_server
        iv_status  TYPE i
        iv_json    TYPE string.
ENDCLASS.

CLASS zcl_transport_import IMPLEMENTATION.

  METHOD if_http_extension~handle_request.
    DATA: lv_body       TYPE string,
          lv_action     TYPE string,
          lv_source_tr  TYPE trkorr,
          lv_target_tr  TYPE trkorr,
          lv_desc       TYPE string,
          lv_target_sys TYPE string,
          lv_success    TYPE abap_bool,
          lv_message    TYPE string,
          lv_json       TYPE string,
          lv_method     TYPE string.

    lv_method = server->request->get_header_field( name = '~request_method' ).
    IF lv_method <> 'POST'.
      lv_json = '{"success":false,"message":"Only POST method allowed"}'.
      send_json_response( io_server = server iv_status = 405 iv_json = lv_json ).
      RETURN.
    ENDIF.

    lv_body = get_request_body( server ).

    " Parse action
    FIND REGEX '"action"\s*:\s*"([^"]+)"' IN lv_body SUBMATCHES lv_action.

    " Parse parameters
    FIND REGEX '"sourceTR"\s*:\s*"([^"]+)"' IN lv_body SUBMATCHES lv_source_tr.
    FIND REGEX '"targetTR"\s*:\s*"([^"]+)"' IN lv_body SUBMATCHES lv_target_tr.
    FIND REGEX '"description"\s*:\s*"([^"]+)"' IN lv_body SUBMATCHES lv_desc.
    FIND REGEX '"targetSystem"\s*:\s*"([^"]+)"' IN lv_body SUBMATCHES lv_target_sys.
    FIND REGEX '"trNumber"\s*:\s*"([^"]+)"' IN lv_body SUBMATCHES lv_source_tr.

    TRANSLATE lv_source_tr TO UPPER CASE.
    TRANSLATE lv_target_tr TO UPPER CASE.
    TRANSLATE lv_target_sys TO UPPER CASE.

    IF lv_action IS INITIAL.
      lv_action = 'FULL'.  " Default: full flow
    ENDIF.
    TRANSLATE lv_action TO UPPER CASE.

    CASE lv_action.
      WHEN 'CREATE'.
        " Create Transport of Copies only
        create_toc(
          EXPORTING iv_description = lv_desc iv_target = lv_target_sys
          IMPORTING ev_trkorr = lv_target_tr ev_success = lv_success ev_message = lv_message ).

        IF lv_success = abap_true.
          CONCATENATE '{"success":true,"trNumber":"' lv_target_tr '","message":"' lv_message '"}' INTO lv_json.
        ELSE.
          CONCATENATE '{"success":false,"message":"' lv_message '"}' INTO lv_json.
        ENDIF.

      WHEN 'COPY'.
        " Copy objects from source to target
        copy_objects(
          EXPORTING iv_source = lv_source_tr iv_target = lv_target_tr
          IMPORTING ev_success = lv_success ev_message = lv_message ).

        IF lv_success = abap_true.
          CONCATENATE '{"success":true,"message":"' lv_message '"}' INTO lv_json.
        ELSE.
          CONCATENATE '{"success":false,"message":"' lv_message '"}' INTO lv_json.
        ENDIF.

      WHEN 'RELEASE'.
        " Release transport
        release_transport(
          EXPORTING iv_trkorr = lv_source_tr
          IMPORTING ev_success = lv_success ev_message = lv_message ).

        IF lv_success = abap_true.
          CONCATENATE '{"success":true,"message":"' lv_message '"}' INTO lv_json.
        ELSE.
          CONCATENATE '{"success":false,"message":"' lv_message '"}' INTO lv_json.
        ENDIF.

      WHEN 'FULL'.
        " Full flow: Create → Copy → Release
        IF lv_source_tr IS INITIAL.
          lv_json = '{"success":false,"message":"sourceTR is required"}'.
          send_json_response( io_server = server iv_status = 400 iv_json = lv_json ).
          RETURN.
        ENDIF.

        IF lv_desc IS INITIAL.
          CONCATENATE 'ToC from' lv_source_tr INTO lv_desc SEPARATED BY space.
        ENDIF.

        IF lv_target_sys IS INITIAL.
          lv_target_sys = 'MBQ'.
        ENDIF.

        " Step 1: Create ToC
        create_toc(
          EXPORTING iv_description = lv_desc iv_target = lv_target_sys
          IMPORTING ev_trkorr = lv_target_tr ev_success = lv_success ev_message = lv_message ).

        IF lv_success <> abap_true.
          CONCATENATE '{"success":false,"step":"create","message":"' lv_message '"}' INTO lv_json.
          send_json_response( io_server = server iv_status = 500 iv_json = lv_json ).
          RETURN.
        ENDIF.

        " Step 2: Copy objects
        " Wait for lock release from create step
        CALL FUNCTION 'DEQUEUE_ALL'.
        WAIT UP TO 1 SECONDS.

        copy_objects(
          EXPORTING iv_source = lv_source_tr iv_target = lv_target_tr
          IMPORTING ev_success = lv_success ev_message = lv_message ).

        IF lv_success <> abap_true.
          CONCATENATE '{"success":false,"step":"copy","trNumber":"' lv_target_tr '","message":"' lv_message '"}' INTO lv_json.
          send_json_response( io_server = server iv_status = 500 iv_json = lv_json ).
          RETURN.
        ENDIF.

        " Step 3: Release
        " Wait for lock release from copy step
        CALL FUNCTION 'DEQUEUE_ALL'.
        WAIT UP TO 1 SECONDS.

        release_transport(
          EXPORTING iv_trkorr = lv_target_tr
          IMPORTING ev_success = lv_success ev_message = lv_message ).

        IF lv_success = abap_true.
          CONCATENATE '{"success":true,"trNumber":"' lv_target_tr '","message":"' lv_message '"}' INTO lv_json.
        ELSE.
          CONCATENATE '{"success":false,"step":"release","trNumber":"' lv_target_tr '","message":"' lv_message '"}' INTO lv_json.
        ENDIF.

      WHEN OTHERS.
        lv_json = '{"success":false,"message":"Unknown action. Use: FULL, CREATE, COPY, RELEASE"}'.
    ENDCASE.

    IF lv_success = abap_true.
      send_json_response( io_server = server iv_status = 200 iv_json = lv_json ).
    ELSE.
      send_json_response( io_server = server iv_status = 500 iv_json = lv_json ).
    ENDIF.

  ENDMETHOD.

  METHOD create_toc.
    DATA: ls_header    TYPE trwbo_request_header,
          lt_tasks     TYPE trwbo_request_headers,
          lv_text      TYPE as4text,
          lv_target_tr TYPE tr_target,
          lv_subrc_str TYPE string.

    ev_success = abap_false.

    lv_text = iv_description.
    lv_target_tr = iv_target.

    " Create Transport of Copies (type T)
    CALL FUNCTION 'TR_INSERT_REQUEST_WITH_TASKS'
      EXPORTING
        iv_type   = 'T'
        iv_text   = lv_text
        iv_owner  = sy-uname
        iv_target = lv_target_tr
      IMPORTING
        es_request_header = ls_header
        et_task_headers   = lt_tasks
      EXCEPTIONS
        insert_failed  = 1
        enqueue_failed = 2
        OTHERS         = 3.

    IF sy-subrc = 0.
      ev_trkorr = ls_header-trkorr.
      ev_success = abap_true.
      CONCATENATE 'ToC created:' ev_trkorr INTO ev_message SEPARATED BY space.
      COMMIT WORK.
    ELSE.
      lv_subrc_str = sy-subrc.
      CONDENSE lv_subrc_str.
      CONCATENATE 'TR_INSERT_REQUEST_WITH_TASKS failed. SY-SUBRC=' lv_subrc_str INTO ev_message.
    ENDIF.

  ENDMETHOD.

  METHOD copy_objects.
    DATA: lv_subrc_str TYPE string,
          lt_objects   TYPE TABLE OF e071,
          lt_keys      TYPE TABLE OF e071k,
          ls_object    TYPE e071.

    ev_success = abap_false.

    " Read objects from source TR (from tasks under the request)
    SELECT * FROM e071 INTO TABLE lt_objects
      WHERE trkorr IN ( SELECT trkorr FROM e070 WHERE strkorr = iv_source )
         OR trkorr = iv_source.

    IF lt_objects IS INITIAL.
      ev_message = 'No objects found in source TR'.
      RETURN.
    ENDIF.

    " Read keys
    SELECT * FROM e071k INTO TABLE lt_keys
      WHERE trkorr IN ( SELECT trkorr FROM e070 WHERE strkorr = iv_source )
         OR trkorr = iv_source.

    " Add objects to target TR
    DATA: ls_ko200 TYPE ko200,
          lv_task  TYPE trkorr.

    " Get task under target TR
    SELECT SINGLE trkorr FROM e070 INTO lv_task
      WHERE strkorr = iv_target
        AND trstatus = 'D'.

    IF lv_task IS INITIAL.
      lv_task = iv_target.
    ENDIF.

    " Insert objects into target task
    LOOP AT lt_objects INTO ls_object.
      ls_object-trkorr = lv_task.
      MODIFY e071 FROM ls_object.
    ENDLOOP.

    " Insert keys
    DATA: ls_key TYPE e071k.
    LOOP AT lt_keys INTO ls_key.
      ls_key-trkorr = lv_task.
      MODIFY e071k FROM ls_key.
    ENDLOOP.

    COMMIT WORK.

    DATA: lv_count TYPE string.
    lv_count = lines( lt_objects ).
    CONDENSE lv_count.
    CONCATENATE lv_count 'objects copied from' iv_source 'to' iv_target
      INTO ev_message SEPARATED BY space.
    ev_success = abap_true.

  ENDMETHOD.

  METHOD release_transport.
    DATA: ls_request   TYPE trwbo_request,
          lt_messages  TYPE ctsgerrmsgs,
          lv_subrc_str TYPE string.

    ev_success = abap_false.

    " Release without dialog
    CALL FUNCTION 'TRINT_RELEASE_REQUEST'
      EXPORTING
        iv_trkorr                   = iv_trkorr
        iv_dialog                   = ' '
        iv_success_message          = ' '
        iv_without_objects_check    = 'X'
        iv_without_docu             = 'X'
        iv_without_locking          = ' '
        iv_ignore_warnings          = 'X'
      IMPORTING
        es_request                  = ls_request
        et_messages                 = lt_messages
      EXCEPTIONS
        cts_initialization_failure  = 1
        enqueue_failed              = 2
        no_authorization            = 3
        invalid_request             = 4
        request_already_released    = 5
        repeat_too_early            = 6
        object_lock_error           = 7
        object_check_error          = 8
        docu_missing                = 9
        db_access_error             = 10
        action_aborted_by_user      = 11
        export_failed               = 12
        execute_objects_check       = 13
        release_in_bg_mode          = 14
        release_in_bg_mode_w_objchk = 15
        error_in_export_methods     = 16
        object_lang_error           = 17
        OTHERS                      = 18.

    IF sy-subrc = 0.
      ev_success = abap_true.
      CONCATENATE 'Released:' iv_trkorr INTO ev_message SEPARATED BY space.
    ELSEIF sy-subrc = 5.
      ev_success = abap_true.
      CONCATENATE 'Already released:' iv_trkorr INTO ev_message SEPARATED BY space.
    ELSE.
      lv_subrc_str = sy-subrc.
      CONDENSE lv_subrc_str.
      CASE sy-subrc.
        WHEN 2. ev_message = 'Enqueue failed - TR locked'.
        WHEN 3. ev_message = 'No authorization to release'.
        WHEN 4. ev_message = 'Invalid request'.
        WHEN 7. ev_message = 'Object lock error'.
        WHEN 12. ev_message = 'Export failed'.
        WHEN OTHERS.
          CONCATENATE 'TRINT_RELEASE_REQUEST failed. SY-SUBRC=' lv_subrc_str INTO ev_message.
      ENDCASE.
    ENDIF.

  ENDMETHOD.

  METHOD get_request_body.
    rv_body = io_server->request->get_cdata( ).
    IF rv_body IS INITIAL.
      DATA: lv_data TYPE xstring.
      lv_data = io_server->request->get_data( ).
      IF lv_data IS NOT INITIAL.
        rv_body = cl_abap_codepage=>convert_from( lv_data ).
      ENDIF.
    ENDIF.
  ENDMETHOD.

  METHOD send_json_response.
    io_server->response->set_status( code = iv_status reason = '' ).
    io_server->response->set_header_field( name = 'Content-Type' value = 'application/json' ).
    io_server->response->set_header_field( name = 'Access-Control-Allow-Origin' value = '*' ).
    io_server->response->set_header_field( name = 'Access-Control-Allow-Methods' value = 'POST, OPTIONS' ).
    io_server->response->set_header_field( name = 'Access-Control-Allow-Headers' value = 'Content-Type, Authorization' ).
    io_server->response->set_cdata( iv_json ).
  ENDMETHOD.

ENDCLASS.